import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { adminPrisma } from "@madar/db";
import { withAdminTx } from "../../shared/db-tx";
import { AdminAuditService, type AdminAuditCtx } from "../auth/admin-audit.service";
import { RedisService } from "../../common/redis.service";
import { EmailService } from "../../common/email/email.service";
import { getTenantPrimaryRecipient } from "../../common/email/recipient.helper";
import { loadEnv } from "../../env";
import { invalidateTenantStatus } from "../../tenant/auth/tenant-status.cache";

// Lifecycle thresholds per docs/0002-bank-transfer-payments.md + tasks.md 1.13b:
//   0 days past due           → status stays `active`, invoice transitions
//                                `awaiting_payment` → `overdue`
//   1-7  days past due        → tenant `active` → `grace_period`
//   8-30 days past due        → tenant `grace_period` → `suspended`
//   31+ days past due         → tenant `suspended` → `cancelled`
// All transitions are idempotent — a second tick on the same day is a no-op.
const GRACE_PERIOD_DAYS = 7;
const SUSPEND_AFTER_DAYS = 30;
const CANCEL_AFTER_DAYS = 31;

// Default billing period + due window when bootstrapping the trial-end invoice.
const TRIAL_INVOICE_DUE_DAYS = 7;
const TRIAL_INVOICE_PERIOD_DAYS = 30;

export interface BillingTickReport {
  ran_at: string;
  trial_invoices_created: number;
  invoices_marked_overdue: number;
  tenants_moved_to_grace: number;
  tenants_moved_to_suspended: number;
  tenants_moved_to_cancelled: number;
  errors: string[];
}

@Injectable()
export class BillingTrackerService {
  private readonly logger = new Logger(BillingTrackerService.name);

  constructor(
    private readonly audit: AdminAuditService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  /**
   * Daily billing tick. Idempotent — designed to be invoked from a cron / BullMQ
   * worker (Phase 1.15) but can also be triggered manually via the admin
   * endpoint for verification. All cross-tenant work runs on `adminPrisma`.
   *
   * Side effects (per CLAUDE.md billing-flow):
   *   - `trialing` tenants past `trial_ends_at` graduate to `active` + get a
   *     `subscription_invoices` row in `awaiting_payment`.
   *   - Unpaid `awaiting_payment` invoices past `due_date` flip to `overdue`.
   *   - Tenants accumulate days-past-due against the *oldest* unpaid invoice
   *     and step through `active → grace_period → suspended → cancelled`.
   *
   * Re-runs in the same day are safe — every mutation is gated on the source
   * state, so a second tick produces no writes and a clean report (all counters
   * zero).
   */
  async runDailyTick(ctxOrNull: AdminAuditCtx | null): Promise<BillingTickReport> {
    const report: BillingTickReport = {
      ran_at: new Date().toISOString(),
      trial_invoices_created: 0,
      invoices_marked_overdue: 0,
      tenants_moved_to_grace: 0,
      tenants_moved_to_suspended: 0,
      tenants_moved_to_cancelled: 0,
      errors: [],
    };
    const now = new Date();
    const ctx: AdminAuditCtx | null = ctxOrNull;

    // ─── 1. Trial bootstrap ──────────────────────────────────────────
    try {
      // Skip tenants without a plan — they signed up but never picked one,
      // so there's nothing to invoice. A future "abandon orphan signups"
      // job can sweep them. For now they stay in trialing forever, locked
      // out by TenantAuthGuard until they pick.
      const trialEnded = await adminPrisma.tenant.findMany({
        where: {
          status: "trialing",
          trial_ends_at: { lte: now },
          plan_id: { not: null },
        },
        include: { plan: true },
      });
      for (const tenant of trialEnded) {
        // Type narrowing: the where filtered by plan_id != null, but Prisma's
        // generated types don't reflect that, so tenant.plan / plan_id remain
        // nullable here. Skip belt-and-suspenders if either is unexpectedly null.
        if (!tenant.plan || !tenant.plan_id) continue;
        const tenantForInvoice = { ...tenant, plan_id: tenant.plan_id, plan: tenant.plan };
        try {
          const result = await this.bootstrapTrialInvoice(tenantForInvoice, now);
          if (result) {
            report.trial_invoices_created += 1;
            // fire-and-forget email
            this.sendInvoiceIssuedEmail(
              tenant.id, tenant.name, result.referenceCode,
              tenant.plan!, result.dueDate,
            ).catch((e) =>
              this.logger.warn(`invoice_issued email failed for ${tenant.id}: ${(e as Error).message}`),
            );
            if (ctx) {
              await this.audit.write(ctx, {
                action: "tenant_trial_ended",
                targetTenantId: tenant.id,
                targetEntity: "tenant",
                targetId: tenant.id,
                metadata: { plan_code: tenant.plan.code },
              });
            }
          }
        } catch (err) {
          report.errors.push(`trial_invoice:${tenant.id}:${(err as Error).message}`);
          this.logger.error(`Trial bootstrap failed for tenant ${tenant.id}`, err);
        }
      }
    } catch (err) {
      report.errors.push(`scan_trialing:${(err as Error).message}`);
      this.logger.error("Failed to scan trialing tenants", err);
    }

    // ─── 2. Mark overdue invoices ────────────────────────────────────
    try {
      const overdueResult = await adminPrisma.subscriptionInvoice.updateMany({
        where: {
          status: "awaiting_payment",
          due_date: { lt: now },
          deleted_at: null,
        },
        data: { status: "overdue" },
      });
      report.invoices_marked_overdue = overdueResult.count;
    } catch (err) {
      report.errors.push(`mark_overdue:${(err as Error).message}`);
      this.logger.error("Failed to mark overdue invoices", err);
    }

    // ─── 3. Advance tenant lifecycle ─────────────────────────────────
    try {
      // Operate on any tenant that *could* transition based on overdue invoices.
      // `cancelled` tenants are terminal.
      const candidates = await adminPrisma.tenant.findMany({
        where: {
          status: { in: ["active", "grace_period", "suspended"] },
        },
        select: { id: true, status: true },
      });
      for (const tenant of candidates) {
        try {
          const oldestUnpaid = await adminPrisma.subscriptionInvoice.findFirst({
            where: {
              tenant_id: tenant.id,
              status: { in: ["overdue", "awaiting_payment"] },
              deleted_at: null,
            },
            orderBy: { due_date: "asc" },
            select: { due_date: true },
          });
          if (!oldestUnpaid) continue;

          const daysPastDue = daysBetween(oldestUnpaid.due_date, now);
          const targetStatus = lifecycleTarget(tenant.status, daysPastDue);
          if (!targetStatus || targetStatus === tenant.status) continue;

          await adminPrisma.tenant.update({
            where: { id: tenant.id },
            data: { status: targetStatus },
          });
          // Invalidate the per-request status cache so the tenant's writes
          // unblock (or block) immediately rather than waiting 30s for TTL.
          await invalidateTenantStatus(tenant.id, this.redis).catch((e) =>
            this.logger.warn(
              `tenant-status cache invalidate failed for ${tenant.id}: ${(e as Error).message}`,
            ),
          );
          if (targetStatus === "grace_period") report.tenants_moved_to_grace += 1;
          if (targetStatus === "suspended") {
            report.tenants_moved_to_suspended += 1;
            this.sendSuspendedEmail(tenant.id).catch((e) =>
              this.logger.warn(`suspended email failed for ${tenant.id}: ${(e as Error).message}`),
            );
          }
          if (targetStatus === "cancelled") report.tenants_moved_to_cancelled += 1;
          if (ctx) {
            await this.audit.write(ctx, {
              action: `tenant_status_${targetStatus}`,
              targetTenantId: tenant.id,
              targetEntity: "tenant",
              targetId: tenant.id,
              metadata: {
                from_status: tenant.status,
                to_status: targetStatus,
                days_past_due: daysPastDue,
              },
            });
          }
        } catch (err) {
          report.errors.push(`advance:${tenant.id}:${(err as Error).message}`);
          this.logger.error(`Lifecycle advance failed for tenant ${tenant.id}`, err);
        }
      }
    } catch (err) {
      report.errors.push(`scan_lifecycle:${(err as Error).message}`);
      this.logger.error("Failed to scan tenants for lifecycle advance", err);
    }

    return report;
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private async bootstrapTrialInvoice(
    tenant: { id: string; plan_id: string; plan: { monthly_price_cents: bigint; currency_code: string; code: string } },
    now: Date,
  ): Promise<{ referenceCode: string; dueDate: Date } | null> {
    // Trial-end invoice. period_start = trial end (≈ now), period_end +30d,
    // due_date +7d. Reference code is opaque + tenant-scoped-unique.
    const referenceCode = `INV-${randomBytes(4).toString("hex").toUpperCase()}`;
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + TRIAL_INVOICE_PERIOD_DAYS);
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + TRIAL_INVOICE_DUE_DAYS);

    const created = await withAdminTx(async (tx) => {
      // Re-check status inside the tx so concurrent ticks can't double-bootstrap.
      const fresh = await tx.tenant.findUnique({ where: { id: tenant.id } });
      if (!fresh || fresh.status !== "trialing") return false;

      await tx.tenant.update({
        where: { id: tenant.id },
        data: { status: "active" },
      });
      await tx.subscriptionInvoice.create({
        data: {
          tenant_id: tenant.id,
          plan_id: tenant.plan_id,
          period_start: now,
          period_end: periodEnd,
          due_date: dueDate,
          amount_cents: tenant.plan.monthly_price_cents,
          currency_code: tenant.plan.currency_code,
          status: "awaiting_payment",
          reference_code: referenceCode,
        },
      });
      return true;
    });
    return created ? { referenceCode, dueDate } : null;
  }

  private async sendInvoiceIssuedEmail(
    tenantId: string,
    tenantName: string,
    referenceCode: string,
    plan: { monthly_price_cents: bigint; currency_code: string },
    dueDate: Date,
  ): Promise<void> {
    const recipient = await getTenantPrimaryRecipient(tenantId);
    if (!recipient) return;
    const amountFormatted = new Intl.NumberFormat(recipient.locale === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency: plan.currency_code || "USD",
      maximumFractionDigits: 2,
    }).format(Number(plan.monthly_price_cents) / 100);
    const tenantOrigin = loadEnv().TENANT_WEB_ORIGIN || "http://localhost:3000";
    await this.email.send({
      template: "invoice_issued",
      to: recipient.email,
      locale: recipient.locale,
      vars: {
        tenantName,
        referenceCode,
        amountFormatted,
        dueDate: dueDate.toLocaleDateString(recipient.locale === "ar" ? "ar-EG" : "en-US", {
          year: "numeric", month: "short", day: "numeric",
        }),
        payUrl: `${tenantOrigin}/${recipient.locale}/billing`,
      },
    });
  }

  private async sendSuspendedEmail(tenantId: string): Promise<void> {
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    if (!tenant) return;
    const recipient = await getTenantPrimaryRecipient(tenantId);
    if (!recipient) return;
    const now = new Date();
    const exportDeadline = new Date(now);
    exportDeadline.setDate(exportDeadline.getDate() + 90);
    const tenantOrigin = loadEnv().TENANT_WEB_ORIGIN || "http://localhost:3000";
    const dateFmt = (d: Date) => d.toLocaleDateString(
      recipient.locale === "ar" ? "ar-EG" : "en-US",
      { year: "numeric", month: "short", day: "numeric" },
    );
    await this.email.send({
      template: "suspended",
      to: recipient.email,
      locale: recipient.locale,
      vars: {
        tenantName: tenant.name,
        suspendedAt: dateFmt(now),
        payInvoiceUrl: `${tenantOrigin}/${recipient.locale}/billing`,
        dataExportEndsAt: dateFmt(exportDeadline),
      },
    });
  }
}

function daysBetween(earlier: Date, later: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.floor(ms / 86_400_000);
}

function lifecycleTarget(current: string, daysPastDue: number): "grace_period" | "suspended" | "cancelled" | null {
  if (daysPastDue >= CANCEL_AFTER_DAYS) return "cancelled";
  if (daysPastDue > SUSPEND_AFTER_DAYS) return "suspended";
  if (daysPastDue > GRACE_PERIOD_DAYS && current !== "suspended") return "suspended";
  if (daysPastDue >= 1 && current === "active") return "grace_period";
  return null;
}
