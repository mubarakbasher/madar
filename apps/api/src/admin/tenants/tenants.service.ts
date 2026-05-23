import { Injectable, NotFoundException } from "@nestjs/common";
import { adminPrisma } from "@madar/db";
import type { ListTenantsQuery } from "./dto/list-tenants.dto";

export interface TenantListItem {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  // null when the tenant hasn't picked a plan yet (post-signup, pre-select).
  plan: { id: string; code: string; name: string } | null;
  status: "trialing" | "active" | "grace_period" | "suspended" | "cancelled";
  branch_count: number;
  user_count: number;
  mrr_cents: string;
  currency_code: string;
  created_at: string;
  trial_ends_at: string | null;
  last_activity_at: string | null;
}

export interface ListTenantsResponse {
  items: TenantListItem[];
  total: number;
  page: number;
  limit: number;
  total_countries: number;
}

const MRR_STATUSES = new Set<string>(["active", "trialing", "grace_period"]);

@Injectable()
export class TenantsService {
  async listTenants(query: ListTenantsQuery): Promise<ListTenantsResponse> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.plan_code ? { plan: { code: query.plan_code } } : {}),
      ...(query.country_code ? { country_code: query.country_code } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { slug: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [tenants, total] = await Promise.all([
      adminPrisma.tenant.findMany({
        where,
        include: { plan: true },
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      adminPrisma.tenant.count({ where }),
    ]);

    const ids = tenants.map((t) => t.id);

    let branchCounts: Array<{ tenant_id: string; cnt: bigint }> = [];
    let userCounts: Array<{ tenant_id: string; cnt: bigint }> = [];
    let lastSales: Array<{ tenant_id: string; max_at: Date | null }> = [];
    if (ids.length) {
      [branchCounts, userCounts, lastSales] = await Promise.all([
        adminPrisma.$queryRawUnsafe<Array<{ tenant_id: string; cnt: bigint }>>(
          `SELECT tenant_id, COUNT(*)::bigint AS cnt
           FROM branches
           WHERE tenant_id = ANY($1::uuid[]) AND deleted_at IS NULL
           GROUP BY tenant_id`,
          ids,
        ),
        adminPrisma.$queryRawUnsafe<Array<{ tenant_id: string; cnt: bigint }>>(
          `SELECT tenant_id, COUNT(*)::bigint AS cnt
           FROM users
           WHERE tenant_id = ANY($1::uuid[]) AND deleted_at IS NULL
           GROUP BY tenant_id`,
          ids,
        ),
        adminPrisma.$queryRawUnsafe<Array<{ tenant_id: string; max_at: Date | null }>>(
          `SELECT tenant_id, MAX(occurred_at) AS max_at
           FROM sales
           WHERE tenant_id = ANY($1::uuid[])
           GROUP BY tenant_id`,
          ids,
        ),
      ]);
    }

    const branchByTenant = new Map(branchCounts.map((r) => [r.tenant_id, Number(r.cnt)]));
    const userByTenant = new Map(userCounts.map((r) => [r.tenant_id, Number(r.cnt)]));
    const saleByTenant = new Map(lastSales.map((r) => [r.tenant_id, r.max_at]));

    const items: TenantListItem[] = tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      country_code: t.country_code,
      plan: t.plan
        ? {
            id: t.plan.id,
            code: t.plan.code,
            name: pickName(t.plan.name_i18n),
          }
        : null,
      status: t.status as TenantListItem["status"],
      branch_count: branchByTenant.get(t.id) ?? 0,
      user_count: userByTenant.get(t.id) ?? 0,
      // No-plan tenants contribute 0 MRR regardless of status.
      mrr_cents:
        t.plan && MRR_STATUSES.has(t.status)
          ? t.plan.monthly_price_cents.toString()
          : "0",
      currency_code: t.default_currency_code,
      created_at: t.created_at.toISOString(),
      trial_ends_at: t.trial_ends_at?.toISOString() ?? null,
      last_activity_at: saleByTenant.get(t.id)?.toISOString() ?? null,
    }));

    // total_countries — distinct count under the SAME filters (so the
    // dropdown reflects the filtered universe).
    const countryRows = await adminPrisma.$queryRawUnsafe<Array<{ country_code: string }>>(
      `SELECT DISTINCT country_code FROM tenants
       WHERE ${buildSqlFilter(query)}`,
      ...buildSqlParams(query),
    );

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      total_countries: countryRows.length,
    };
  }

  async getTenantDetail(tenantId: string): Promise<TenantDetailResponse> {
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: "tenant_not_found", message: "Tenant not found" });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [
      branches,
      users,
      recentInvoices,
      revenueAgg,
      saleCountAgg,
      lastSale,
    ] = await Promise.all([
      adminPrisma.branch.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
        select: {
          id: true,
          code: true,
          name_i18n: true,
          currency_code: true,
          is_active: true,
          opened_at: true,
        },
        orderBy: { code: "asc" },
      }),
      adminPrisma.user.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          is_active: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      }),
      adminPrisma.subscriptionInvoice.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
        orderBy: { created_at: "desc" },
        take: 5,
        select: {
          id: true,
          reference_code: true,
          status: true,
          amount_cents: true,
          currency_code: true,
          period_start: true,
          period_end: true,
          due_date: true,
          paid_at: true,
        },
      }),
      adminPrisma.sale.aggregate({
        where: { tenant_id: tenantId, occurred_at: { gte: thirtyDaysAgo } },
        _sum: { total_cents: true },
      }),
      adminPrisma.sale.count({
        where: { tenant_id: tenantId, occurred_at: { gte: thirtyDaysAgo } },
      }),
      adminPrisma.sale.findFirst({
        where: { tenant_id: tenantId },
        orderBy: { occurred_at: "desc" },
        select: { occurred_at: true },
      }),
    ]);

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      name_i18n: tenant.name_i18n as { en: string; ar: string },
      country_code: tenant.country_code,
      default_currency_code: tenant.default_currency_code,
      default_locale: tenant.default_locale,
      status: tenant.status as TenantListItem["status"],
      trial_ends_at: tenant.trial_ends_at?.toISOString() ?? null,
      created_at: tenant.created_at.toISOString(),
      plan: tenant.plan
        ? {
            id: tenant.plan.id,
            code: tenant.plan.code,
            name: pickName(tenant.plan.name_i18n),
            monthly_price_cents: tenant.plan.monthly_price_cents.toString(),
            currency_code: tenant.plan.currency_code,
          }
        : null,
      kpis: {
        last_30d_revenue_cents: (revenueAgg._sum.total_cents ?? 0n).toString(),
        last_30d_sale_count: saleCountAgg,
        branch_count: branches.length,
        user_count: users.length,
        last_activity_at: lastSale?.occurred_at.toISOString() ?? null,
      },
      branches: branches.map((b) => ({
        id: b.id,
        code: b.code,
        name_i18n: b.name_i18n as { en: string; ar: string },
        currency_code: b.currency_code,
        is_active: b.is_active,
        opened_at: b.opened_at?.toISOString() ?? null,
      })),
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        is_active: u.is_active,
        created_at: u.created_at.toISOString(),
      })),
      recent_invoices: recentInvoices.map((inv) => ({
        id: inv.id,
        reference_code: inv.reference_code,
        status: inv.status,
        amount_cents: inv.amount_cents.toString(),
        currency_code: inv.currency_code,
        period_start: inv.period_start.toISOString().slice(0, 10),
        period_end: inv.period_end.toISOString().slice(0, 10),
        due_date: inv.due_date.toISOString().slice(0, 10),
        paid_at: inv.paid_at?.toISOString() ?? null,
      })),
    };
  }
}

export interface TenantDetailResponse {
  id: string;
  slug: string;
  name: string;
  name_i18n: { en: string; ar: string };
  country_code: string;
  default_currency_code: string;
  default_locale: string;
  status: TenantListItem["status"];
  trial_ends_at: string | null;
  created_at: string;
  plan: {
    id: string;
    code: string;
    name: string;
    monthly_price_cents: string;
    currency_code: string;
  } | null;
  kpis: {
    last_30d_revenue_cents: string;
    last_30d_sale_count: number;
    branch_count: number;
    user_count: number;
    last_activity_at: string | null;
  };
  branches: Array<{
    id: string;
    code: string;
    name_i18n: { en: string; ar: string };
    currency_code: string;
    is_active: boolean;
    opened_at: string | null;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
    created_at: string;
  }>;
  recent_invoices: Array<{
    id: string;
    reference_code: string;
    status: string;
    amount_cents: string;
    currency_code: string;
    period_start: string;
    period_end: string;
    due_date: string;
    paid_at: string | null;
  }>;
}

function pickName(name_i18n: unknown): string {
  const obj = (name_i18n ?? {}) as { en?: string; ar?: string };
  return obj.en ?? obj.ar ?? "";
}

// Build a parameterized WHERE clause matching the Prisma filters. Keeps the
// distinct-country query in sync with the main list query without sprinkling
// string concatenation that could SQL-inject.
function buildSqlFilter(q: ListTenantsQuery): string {
  const parts: string[] = ["TRUE"];
  let i = 1;
  if (q.status) {
    parts.push(`status = $${i++}::"TenantStatus"`);
  }
  if (q.country_code) {
    parts.push(`country_code = $${i++}`);
  }
  if (q.plan_code) {
    parts.push(`plan_id = (SELECT id FROM plans WHERE code = $${i++})`);
  }
  if (q.search) {
    parts.push(`(name ILIKE $${i} OR slug ILIKE $${i})`);
    i++;
  }
  return parts.join(" AND ");
}

function buildSqlParams(q: ListTenantsQuery): unknown[] {
  const out: unknown[] = [];
  if (q.status) out.push(q.status);
  if (q.country_code) out.push(q.country_code);
  if (q.plan_code) out.push(q.plan_code);
  if (q.search) out.push(`%${q.search}%`);
  return out;
}
