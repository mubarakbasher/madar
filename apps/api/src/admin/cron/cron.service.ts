import { Injectable, Logger } from "@nestjs/common";
// Cross-tenant scans use adminPrisma — this module operates at the platform
// scope (similar to BillingTrackerService).
// eslint-disable-next-line no-restricted-imports
import { adminPrisma } from "@madar/db";
import { EmailService } from "../../common/email/email.service";
import { getTenantPrimaryRecipient } from "../../common/email/recipient.helper";
import type { LowStockAlertItem, LowStockAlertVars } from "../../common/email/email.types";
import { AdminAuditService, type AdminAuditCtx } from "../auth/admin-audit.service";
import { loadEnv } from "../../env";
import {
  LOW_STOCK_DEDUP_HOURS,
  LOW_STOCK_DIGEST_CAP,
  TRIAL_REMINDER_WINDOW_MAX_DAYS,
  TRIAL_REMINDER_WINDOW_MIN_DAYS,
  type LowStockReport,
  type TrialReminderReport,
} from "./cron.types";

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Cron-side notification gate. Reads the tenant's preference for
 * (event_type × email) — defaults to enabled when no row exists so existing
 * tenants don't silently lose alerts.
 */
async function isEventEnabled(
  tenantId: string,
  eventType: "low_stock" | "trial_ending",
): Promise<boolean> {
  const row = await adminPrisma.notificationPreference.findUnique({
    where: {
      tenant_id_event_type_channel: {
        tenant_id: tenantId,
        event_type: eventType,
        channel: "email",
      },
    },
    select: { enabled: true },
  });
  return row?.enabled ?? true;
}

@Injectable()
export class AdminCronService {
  private readonly logger = new Logger(AdminCronService.name);

  constructor(
    private readonly email: EmailService,
    private readonly audit: AdminAuditService,
  ) {}

  /**
   * Trial-ending reminder tick. Idempotent: each tenant's
   * `trial_reminder_sent_at` is set after the first send, so subsequent ticks
   * skip them. Window is [now + MIN_DAYS, now + MAX_DAYS) — matches the
   * "3 days before" PRD requirement plus a buffer for missed-run recovery.
   */
  async runTrialReminderTick(ctx: AdminAuditCtx | null): Promise<TrialReminderReport> {
    const report: TrialReminderReport = {
      ran_at: new Date().toISOString(),
      tenants_scanned: 0,
      reminders_sent: 0,
      skipped_no_recipient: 0,
      errors: [],
    };

    const now = new Date();
    const windowStart = new Date(now.getTime() + TRIAL_REMINDER_WINDOW_MIN_DAYS * MS_PER_DAY);
    const windowEnd = new Date(now.getTime() + TRIAL_REMINDER_WINDOW_MAX_DAYS * MS_PER_DAY);

    let candidates: Array<{
      id: string;
      name: string;
      trial_ends_at: Date | null;
      plan: { code: string };
    }>;
    try {
      const rows = await adminPrisma.tenant.findMany({
        where: {
          status: "trialing",
          trial_ends_at: { gte: windowStart, lt: windowEnd },
          trial_reminder_sent_at: null,
          // No reminder for tenants who never picked a plan — they're not
          // mid-trial in any commercial sense; the trial timer is just a
          // dormant clock until they self-select via /v1/onboarding/select-plan.
          plan_id: { not: null },
        },
        include: { plan: { select: { code: true } } },
      });
      candidates = rows.filter((r): r is typeof r & { plan: { code: string } } => r.plan !== null);
    } catch (err) {
      report.errors.push(`scan:${(err as Error).message}`);
      return report;
    }
    report.tenants_scanned = candidates.length;

    const tenantOrigin = loadEnv().TENANT_WEB_ORIGIN || "http://localhost:3000";

    for (const tenant of candidates) {
      if (!tenant.trial_ends_at) continue;
      try {
        // Notification gate (Slice 6) — owner muted trial_ending → skip silently.
        if (!(await isEventEnabled(tenant.id, "trial_ending"))) continue;
        const recipient = await getTenantPrimaryRecipient(tenant.id);
        if (!recipient) {
          report.skipped_no_recipient += 1;
          continue;
        }
        const daysLeft = Math.max(
          0,
          Math.ceil((tenant.trial_ends_at.getTime() - now.getTime()) / MS_PER_DAY),
        );
        await this.email.send({
          template: "trial_ending",
          to: recipient.email,
          locale: recipient.locale,
          vars: {
            tenantName: tenant.name,
            daysLeft,
            payInvoiceUrl: `${tenantOrigin}/${recipient.locale}/billing`,
          },
        });
        // Stamp the dedup column. A second tick the same day is then a no-op.
        await adminPrisma.tenant.update({
          where: { id: tenant.id },
          data: { trial_reminder_sent_at: new Date() },
        });
        report.reminders_sent += 1;
        if (ctx) {
          await this.audit.write(ctx, {
            action: "trial_reminder_sent",
            targetTenantId: tenant.id,
            targetEntity: "tenant",
            targetId: tenant.id,
            metadata: { days_left: daysLeft, recipient_email: recipient.email },
          });
        }
      } catch (err) {
        report.errors.push(`tenant:${tenant.id}:${(err as Error).message}`);
        this.logger.error(`trial reminder failed for ${tenant.id}`, err);
      }
    }
    return report;
  }

  /**
   * Low-stock digest tick. Queries every active tenant; for each, finds
   * branch_stock rows with qty_on_hand <= reorder_point that haven't been
   * alerted in the past 24h. Sends one digest per tenant to the owner and
   * bumps last_low_stock_alert_at on the included rows.
   */
  async runLowStockTick(ctx: AdminAuditCtx | null): Promise<LowStockReport> {
    const report: LowStockReport = {
      ran_at: new Date().toISOString(),
      tenants_scanned: 0,
      tenants_alerted: 0,
      items_alerted: 0,
      errors: [],
    };

    const dedupCutoff = new Date(Date.now() - LOW_STOCK_DEDUP_HOURS * MS_PER_HOUR);
    const tenantOrigin = loadEnv().TENANT_WEB_ORIGIN || "http://localhost:3000";

    let tenants: Array<{ id: string; name: string; default_locale: string }>;
    try {
      tenants = await adminPrisma.tenant.findMany({
        where: { status: { in: ["trialing", "active", "grace_period"] } },
        select: { id: true, name: true, default_locale: true },
      });
    } catch (err) {
      report.errors.push(`scan_tenants:${(err as Error).message}`);
      return report;
    }
    report.tenants_scanned = tenants.length;

    for (const tenant of tenants) {
      try {
        // Notification gate (Slice 6) — owner muted low_stock → skip without
        // scanning the rows (the scan is the expensive part).
        if (!(await isEventEnabled(tenant.id, "low_stock"))) continue;
        const rows = await this.fetchLowStockRowsForTenant(tenant.id, dedupCutoff);
        if (rows.length === 0) continue;

        const recipient = await getTenantPrimaryRecipient(tenant.id);
        if (!recipient) continue;

        const overflowCount = Math.max(0, rows.length - LOW_STOCK_DIGEST_CAP);
        const items = rows.slice(0, LOW_STOCK_DIGEST_CAP);

        const vars: LowStockAlertVars = {
          tenantName: tenant.name,
          itemCount: rows.length,
          itemsHtml: this.renderItemsHtml(items, recipient.locale),
          itemsText: this.renderItemsText(items, recipient.locale),
          overflowNote:
            overflowCount > 0
              ? recipient.locale === "ar"
                ? `…و${overflowCount} صنفاً آخر.`
                : `…and ${overflowCount} more items.`
              : "",
          inventoryUrl: `${tenantOrigin}/${recipient.locale}/inventory`,
        };

        await this.email.send({
          template: "low_stock_alert",
          to: recipient.email,
          locale: recipient.locale,
          vars,
        });

        // Bump last_low_stock_alert_at on the included rows so the next tick
        // (within DEDUP_HOURS) doesn't re-send them.
        const rowIds = items.map((r) => r.row_id);
        await adminPrisma.branchStock.updateMany({
          where: { id: { in: rowIds } },
          data: { last_low_stock_alert_at: new Date() },
        });

        report.tenants_alerted += 1;
        report.items_alerted += items.length;
        if (ctx) {
          await this.audit.write(ctx, {
            action: "low_stock_alert_sent",
            targetTenantId: tenant.id,
            targetEntity: "tenant",
            targetId: tenant.id,
            metadata: {
              item_count: rows.length,
              capped_to: items.length,
              recipient_email: recipient.email,
            },
          });
        }
      } catch (err) {
        report.errors.push(`tenant:${tenant.id}:${(err as Error).message}`);
        this.logger.error(`low-stock tick failed for ${tenant.id}`, err);
      }
    }
    return report;
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private async fetchLowStockRowsForTenant(
    tenantId: string,
    dedupCutoff: Date,
  ): Promise<Array<LowStockAlertItem & { row_id: string }>> {
    const rows = await adminPrisma.$queryRawUnsafe<
      Array<{
        row_id: string;
        sku: string;
        name_i18n: { en: string; ar: string };
        branch_code: string;
        qty_on_hand: number;
        reorder_point: number;
      }>
    >(
      `SELECT bs.id AS row_id,
              p.sku,
              p.name_i18n,
              b.code AS branch_code,
              bs.qty_on_hand,
              bs.reorder_point
       FROM branch_stock bs
       INNER JOIN products p ON p.id = bs.product_id AND p.deleted_at IS NULL AND p.is_active = TRUE
       INNER JOIN branches b ON b.id = bs.branch_id AND b.deleted_at IS NULL AND b.is_active = TRUE
       WHERE bs.tenant_id = $1::uuid
         AND bs.deleted_at IS NULL
         AND bs.reorder_point IS NOT NULL
         AND bs.qty_on_hand <= bs.reorder_point
         AND (bs.last_low_stock_alert_at IS NULL OR bs.last_low_stock_alert_at < $2::timestamptz)
       ORDER BY (bs.reorder_point - bs.qty_on_hand) DESC, p.sku ASC`,
      tenantId,
      dedupCutoff,
    );
    return rows.map((r) => ({
      row_id: r.row_id,
      sku: r.sku,
      name_i18n: r.name_i18n,
      branch_code: r.branch_code,
      qty_on_hand: Number(r.qty_on_hand),
      reorder_point: Number(r.reorder_point),
    }));
  }

  private renderItemsHtml(items: LowStockAlertItem[], locale: "en" | "ar"): string {
    return items
      .map((i) => {
        const name = i.name_i18n[locale] || i.name_i18n.en || i.sku;
        const cellAlign = locale === "ar" ? "right" : "left";
        const numAlign = locale === "ar" ? "left" : "right";
        return `<tr style="border-bottom: 1px solid #F4F0EA;">
  <td style="padding: 8px 4px; font-family: monospace; text-align: ${cellAlign};">${escapeHtml(i.sku)}</td>
  <td style="padding: 8px 4px; text-align: ${cellAlign};">${escapeHtml(name)}</td>
  <td style="padding: 8px 4px; text-align: ${cellAlign};">${escapeHtml(i.branch_code)}</td>
  <td style="padding: 8px 4px; text-align: ${numAlign};">${i.qty_on_hand}</td>
  <td style="padding: 8px 4px; text-align: ${numAlign};">${i.reorder_point}</td>
</tr>`;
      })
      .join("");
  }

  private renderItemsText(items: LowStockAlertItem[], locale: "en" | "ar"): string {
    return items
      .map((i) => {
        const name = i.name_i18n[locale] || i.name_i18n.en || i.sku;
        return `${i.sku} · ${name} · ${i.branch_code} · ${i.qty_on_hand}/${i.reorder_point}`;
      })
      .join("\n");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
