import { Injectable, NotFoundException } from "@nestjs/common";
// Billing reads platform-scoped tables (plans, tenants, platform_bank_accounts)
// which sit outside RLS. adminPrisma is the correct client for those.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";

export interface ApiPlan {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  monthly_price_cents: string;
  currency_code: string;
  limits: Record<string, unknown>;
  is_active: boolean;
}

export interface ApiPlatformBankAccount {
  id: string;
  name_i18n: { en: string; ar: string };
  bank_name: string;
  account_holder: string;
  account_number_last4: string;
  iban_last4: string | null;
  swift: string | null;
  currency_code: string;
  country_code: string;
  notes_i18n: { en?: string; ar?: string };
}

export interface ApiSubscriptionInvoice {
  id: string;
  reference_code: string;
  status: string;
  amount_cents: string;
  currency_code: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  plan: { code: string; name_i18n: { en: string; ar: string } };
}

export interface ApiSubscriptionView {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    trial_ends_at: string | null;
    default_currency_code: string;
  };
  plan: ApiPlan;
  usage: {
    transactions_this_period: number;
    users: number;
    branches: number;
    storage_bytes: number;
  };
  next_invoice: ApiSubscriptionInvoice | null;
}

@Injectable()
export class BillingService {
  // ─── plans (platform-scoped) ──────────────────────────────────────
  async listPlans(): Promise<{ items: ApiPlan[]; total: number }> {
    const plans = await adminPrisma.plan.findMany({
      where: { is_active: true },
      orderBy: { monthly_price_cents: "asc" },
    });
    return {
      items: plans.map((p) => toApiPlan(p)),
      total: plans.length,
    };
  }

  // ─── subscription overview ────────────────────────────────────────
  async getSubscription(tenantId: string): Promise<ApiSubscriptionView> {
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: "tenant_not_found", message: "Tenant not found" });
    }

    // Compute current billing period — for trial this is { trial start, trial end },
    // for active this is monthly cycle. Coarse approximation in 1.13: last 30 days.
    const periodStart = new Date(Date.now() - 30 * 86_400_000);
    const scoped = tenantScoped(tenantId);

    const [salesCount, userCount, branchCount, nextInvoice] = await Promise.all([
      scoped.sale.count({ where: { occurred_at: { gte: periodStart } } }),
      scoped.user.count({ where: { deleted_at: null } }),
      scoped.branch.count({ where: { deleted_at: null } }),
      scoped.subscriptionInvoice.findFirst({
        where: {
          deleted_at: null,
          status: { in: ["draft", "awaiting_payment", "in_review", "overdue"] },
        },
        orderBy: { due_date: "asc" },
        include: { plan: true },
      }),
    ]);

    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        trial_ends_at: tenant.trial_ends_at?.toISOString() ?? null,
        default_currency_code: tenant.default_currency_code,
      },
      plan: toApiPlan(tenant.plan),
      usage: {
        transactions_this_period: salesCount,
        users: userCount,
        branches: branchCount,
        // Real storage aggregation belongs to 1.13 hardening; report 0 for now.
        storage_bytes: 0,
      },
      next_invoice: nextInvoice ? toApiInvoice(nextInvoice) : null,
    };
  }

  // ─── invoice list ─────────────────────────────────────────────────
  async listInvoices(
    tenantId: string,
    query: { status?: string },
  ): Promise<{ items: ApiSubscriptionInvoice[]; total: number }> {
    const scoped = tenantScoped(tenantId);
    let statusFilter: { in?: string[] } | string | undefined;
    if (query.status === "pending") {
      statusFilter = { in: ["draft", "awaiting_payment", "in_review", "overdue"] };
    } else if (query.status === "paid") {
      statusFilter = "paid";
    } else if (query.status === "awaiting_payment" || query.status === "in_review" || query.status === "overdue" || query.status === "paid" || query.status === "cancelled" || query.status === "draft") {
      statusFilter = query.status;
    }

    const rows = await scoped.subscriptionInvoice.findMany({
      where: {
        deleted_at: null,
        ...(statusFilter ? { status: statusFilter as never } : {}),
      },
      include: { plan: true },
      orderBy: { due_date: "desc" },
      take: 200,
    });
    return {
      items: rows.map((r) => toApiInvoice(r)),
      total: rows.length,
    };
  }

  // ─── single invoice ───────────────────────────────────────────────
  async getInvoice(tenantId: string, invoiceId: string): Promise<ApiSubscriptionInvoice & { proofs: Array<{ id: string; status: string; created_at: string; transfer_reference: string | null }> }> {
    const scoped = tenantScoped(tenantId);
    const invoice = await scoped.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: { plan: true },
    });
    if (!invoice || invoice.deleted_at) {
      throw new NotFoundException({ code: "invoice_not_found", message: "Invoice not found" });
    }
    const proofs = await scoped.paymentProof.findMany({
      where: { context: "subscription", reference_id: invoiceId, deleted_at: null },
      orderBy: { created_at: "desc" },
      select: { id: true, status: true, created_at: true, transfer_reference: true },
    });
    return {
      ...toApiInvoice(invoice),
      proofs: proofs.map((p) => ({
        id: p.id,
        status: p.status,
        created_at: p.created_at.toISOString(),
        transfer_reference: p.transfer_reference,
      })),
    };
  }

  // ─── platform bank accounts ───────────────────────────────────────
  async listPlatformBankAccounts(opts: {
    currency?: string;
    countryCode?: string;
  }): Promise<{ items: ApiPlatformBankAccount[]; total: number }> {
    const rows = await adminPrisma.platformBankAccount.findMany({
      where: {
        is_active: true,
        ...(opts.currency ? { currency_code: opts.currency } : {}),
        ...(opts.countryCode ? { country_code: opts.countryCode } : {}),
      },
      orderBy: { bank_name: "asc" },
    });
    return {
      items: rows.map((b) => ({
        id: b.id,
        name_i18n: b.name_i18n as { en: string; ar: string },
        bank_name: b.bank_name,
        account_holder: b.account_holder,
        account_number_last4: b.account_number_last4,
        iban_last4: b.iban_last4,
        swift: b.swift,
        currency_code: b.currency_code,
        country_code: b.country_code,
        notes_i18n: (b.notes_i18n ?? {}) as { en?: string; ar?: string },
      })),
      total: rows.length,
    };
  }
}

function toApiPlan(p: {
  id: string;
  code: string;
  name_i18n: unknown;
  monthly_price_cents: bigint;
  currency_code: string;
  limits: unknown;
  is_active: boolean;
}): ApiPlan {
  return {
    id: p.id,
    code: p.code,
    name_i18n: (p.name_i18n ?? { en: "", ar: "" }) as { en: string; ar: string },
    monthly_price_cents: p.monthly_price_cents.toString(),
    currency_code: p.currency_code,
    limits: (p.limits ?? {}) as Record<string, unknown>,
    is_active: p.is_active,
  };
}

function toApiInvoice(inv: {
  id: string;
  reference_code: string;
  status: string;
  amount_cents: bigint;
  currency_code: string;
  period_start: Date;
  period_end: Date;
  due_date: Date;
  paid_at: Date | null;
  plan: { code: string; name_i18n: unknown };
}): ApiSubscriptionInvoice {
  return {
    id: inv.id,
    reference_code: inv.reference_code,
    status: inv.status,
    amount_cents: inv.amount_cents.toString(),
    currency_code: inv.currency_code,
    period_start: inv.period_start.toISOString().slice(0, 10),
    period_end: inv.period_end.toISOString().slice(0, 10),
    due_date: inv.due_date.toISOString().slice(0, 10),
    paid_at: inv.paid_at?.toISOString() ?? null,
    plan: {
      code: inv.plan.code,
      name_i18n: (inv.plan.name_i18n ?? { en: "", ar: "" }) as { en: string; ar: string },
    },
  };
}
