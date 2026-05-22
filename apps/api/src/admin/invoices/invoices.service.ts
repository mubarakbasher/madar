import { Injectable } from "@nestjs/common";
import { adminPrisma } from "@madar/db";

export interface AdminInvoiceItem {
  id: string;
  reference_code: string;
  tenant: { id: string; slug: string; name: string };
  plan: { code: string; name: string };
  status: string;
  amount_cents: string;
  currency_code: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  days_overdue: number;
}

export interface ListAdminInvoicesQuery {
  status?: string;
  currency?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface ListAdminInvoicesResponse {
  items: AdminInvoiceItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AdminInvoicesService {
  async list(query: ListAdminInvoicesQuery): Promise<ListAdminInvoicesResponse> {
    // Pre-filter by tenant when search is set — schema has no SubscriptionInvoice→Tenant
    // relation, so we resolve matching tenant ids first.
    let tenantIdFilter: string[] | undefined;
    if (query.search) {
      const matches = await adminPrisma.tenant.findMany({
        where: {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { slug: { contains: query.search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      tenantIdFilter = matches.map((m) => m.id);
      if (tenantIdFilter.length === 0) {
        return { items: [], total: 0, page: query.page, limit: query.limit };
      }
    }

    const where: Record<string, unknown> = { deleted_at: null };
    if (query.status === "pending") {
      where.status = { in: ["draft", "awaiting_payment", "in_review", "overdue"] };
    } else if (query.status === "overdue") {
      where.status = { in: ["awaiting_payment", "overdue"] };
      where.due_date = { lt: new Date() };
    } else if (query.status) {
      where.status = query.status;
    }
    if (query.currency) where.currency_code = query.currency;
    if (tenantIdFilter) where.tenant_id = { in: tenantIdFilter };
    if (query.search) {
      where.OR = [
        { reference_code: { contains: query.search, mode: "insensitive" } },
        { tenant_id: { in: tenantIdFilter } },
      ];
      // Re-add reference_code OR + the precomputed tenant filter; remove the
      // top-level tenant_id so the OR is the authoritative tenant filter.
      delete where.tenant_id;
    }

    const [rows, total] = await Promise.all([
      adminPrisma.subscriptionInvoice.findMany({
        where,
        include: { plan: true },
        orderBy: [{ due_date: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      adminPrisma.subscriptionInvoice.count({ where }),
    ]);

    const tenantIds = Array.from(new Set(rows.map((r) => r.tenant_id)));
    const tenants = tenantIds.length
      ? await adminPrisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, slug: true, name: true },
        })
      : [];
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    const now = Date.now();
    const items: AdminInvoiceItem[] = rows.map((r) => {
      const due = r.due_date.getTime();
      const daysOverdue = r.status === "paid" ? 0 : Math.max(0, Math.floor((now - due) / 86_400_000));
      const tenant = tenantById.get(r.tenant_id) ?? {
        id: r.tenant_id,
        slug: "(deleted)",
        name: "(deleted)",
      };
      return {
        id: r.id,
        reference_code: r.reference_code,
        tenant,
        plan: { code: r.plan.code, name: pickName(r.plan.name_i18n) },
        status: r.status,
        amount_cents: r.amount_cents.toString(),
        currency_code: r.currency_code,
        period_start: r.period_start.toISOString().slice(0, 10),
        period_end: r.period_end.toISOString().slice(0, 10),
        due_date: r.due_date.toISOString().slice(0, 10),
        paid_at: r.paid_at?.toISOString() ?? null,
        days_overdue: daysOverdue,
      };
    });

    return { items, total, page: query.page, limit: query.limit };
  }
}

function pickName(name_i18n: unknown): string {
  const obj = (name_i18n ?? {}) as { en?: string; ar?: string };
  return obj.en ?? obj.ar ?? "";
}
