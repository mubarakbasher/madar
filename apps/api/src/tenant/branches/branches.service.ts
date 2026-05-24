import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
// Branch detail reads tenant.default_currency_code from the platform-scoped
// tenants table (no tenant_id column, not under RLS).
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped, Prisma } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { CreateBranchBody } from "./dto/create-branch.dto";
import type { UpdateBranchBody } from "./dto/update-branch.dto";
import type { ListBranchesQuery } from "./dto/list-branches.dto";
import type { BranchStockQuery } from "./dto/stock-query.dto";
import type { OperatingHours, Holidays } from "./dto/hours.dto";

export interface ApiBranchSummary {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  address_i18n: { en?: string; ar?: string } | null;
  currency_code: string;
  timezone: string;
  is_active: boolean;
  opened_at: string | null;
  today_revenue_cents: string;
  staff_count: number;
  product_count: number;
  geo_lat: number | null;
  geo_lng: number | null;
}

export interface ApiBranchUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ApiBranchActivity {
  id: string;
  kind: "audit" | "sale";
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  reference: string | null;
}

export interface ApiBranchKpis {
  today_revenue_cents: string;
  week_revenue_cents: string;
  transactions_today: number;
  transactions_week: number;
  top_product_id: string | null;
  top_product_name: { en: string; ar: string } | null;
  units_sold_top_product: number;
}

export interface ApiBranchDetail extends ApiBranchSummary {
  kpis: ApiBranchKpis;
  users: ApiBranchUser[];
  recent_activity: ApiBranchActivity[];
  operating_hours: OperatingHours | null;
  holidays: Holidays | null;
}

export interface ApiBranchDashboardLeaderRow {
  branch_id: string;
  name_i18n: { en: string; ar: string };
  today_cents: string;
  rank: number;
}

export interface ApiBranchDashboard {
  branch_id: string;
  branch_name_i18n: { en: string; ar: string };
  currency_code: string;
  today_cents: string;
  yesterday_cents: string;
  vs_yesterday_pct: number | null;
  transactions_today: number;
  items_sold_today: number;
  avg_basket_cents: string;
  returns_today: number;
  hourly: Array<{ hour: number; cents: number }>;
  top_categories: Array<{
    category_id: string | null;
    category_code: string | null;
    name_i18n: { en: string; ar: string } | null;
    cents: number;
  }>;
  leaderboard: ApiBranchDashboardLeaderRow[];
  my_rank: number | null;
}

export interface ApiBranchStockRow {
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  category_id: string | null;
  category_code: string | null;
  qty_on_hand: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  available: number;
  last_movement_at: string | null;
  image_url: string | null;
}

interface BranchRevenueRow {
  branch_id: string;
  today_cents: bigint | number | null;
  txns_today: bigint | number | null;
}

interface BranchCountRow {
  branch_id: string;
  product_count: bigint | number;
}

interface BranchStaffCountRow {
  branch_id: string;
  staff_count: bigint | number;
}

interface BranchTopProductRow {
  product_id: string;
  units: bigint | number;
}

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── reads ───────────────────────────────────────────────────────────────

  async listForTenant(
    tenantId: string,
    q: ListBranchesQuery = { include_inactive: false },
  ): Promise<{ items: ApiBranchSummary[]; total: number }> {
    const client = tenantScoped(tenantId);
    const rows = await client.branch.findMany({
      where: { deleted_at: null, ...(q.include_inactive ? {} : { is_active: true }) },
      orderBy: { code: "asc" },
    });
    if (rows.length === 0) return { items: [], total: 0 };

    const ids = rows.map((r) => r.id);
    const [revenue, productCounts, staffCounts] = await Promise.all([
      this.todayRevenuePerBranch(tenantId, ids),
      this.productCountPerBranch(tenantId, ids),
      this.staffCountPerBranch(tenantId, ids),
    ]);

    const revenueById = new Map<string, BranchRevenueRow>();
    for (const r of revenue) revenueById.set(r.branch_id, r);

    const productCountById = new Map<string, number>();
    for (const r of productCounts)
      productCountById.set(
        r.branch_id,
        typeof r.product_count === "bigint" ? Number(r.product_count) : Number(r.product_count),
      );

    const staffById = new Map<string, number>();
    for (const r of staffCounts)
      staffById.set(
        r.branch_id,
        typeof r.staff_count === "bigint" ? Number(r.staff_count) : Number(r.staff_count),
      );

    const items: ApiBranchSummary[] = rows.map((r) => {
      const rev = revenueById.get(r.id);
      return {
        id: r.id,
        code: r.code,
        name_i18n: r.name_i18n as { en: string; ar: string },
        address_i18n: (r.address_i18n as { en?: string; ar?: string } | null) ?? null,
        currency_code: r.currency_code,
        timezone: r.timezone,
        is_active: r.is_active,
        opened_at: r.opened_at ? r.opened_at.toISOString().slice(0, 10) : null,
        today_revenue_cents: bigintToString(rev?.today_cents),
        staff_count: staffById.get(r.id) ?? 0,
        product_count: productCountById.get(r.id) ?? 0,
        geo_lat: decimalToNumber(r.geo_lat),
        geo_lng: decimalToNumber(r.geo_lng),
      };
    });

    return { items, total: items.length };
  }

  async getBranch(tenantId: string, branchId: string): Promise<ApiBranchDetail> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.branch.findUnique({ where: { id: branchId } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({ code: "branch_not_found", message: "Branch not found" });
    }

    const [revenueRows, weekRow, topProduct, users, productCount, staffCount, recentAudit, recentSales] =
      await Promise.all([
        this.todayRevenuePerBranch(tenantId, [branchId]),
        this.weekRevenueForBranch(tenantId, branchId, row.timezone),
        this.topProductForBranchToday(tenantId, branchId, row.timezone),
        scoped.user.findMany({
          where: { branch_id: branchId, deleted_at: null, is_active: true },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: "asc" },
        }),
        this.productCountPerBranch(tenantId, [branchId]),
        this.staffCountPerBranch(tenantId, [branchId]),
        scoped.auditLog.findMany({
          where: { entity: "branch", entity_id: branchId },
          orderBy: { created_at: "desc" },
          take: 10,
        }),
        scoped.sale.findMany({
          where: { branch_id: branchId, deleted_at: null },
          orderBy: { occurred_at: "desc" },
          take: 10,
          select: {
            id: true,
            code: true,
            total_cents: true,
            occurred_at: true,
            cashier_id: true,
          },
        }),
      ]);

    const todayRev = revenueRows[0];
    const todayCents = bigintToString(todayRev?.today_cents);
    const todayTxns =
      typeof todayRev?.txns_today === "bigint"
        ? Number(todayRev?.txns_today)
        : Number(todayRev?.txns_today ?? 0);

    const userNames = new Map<string, string>();
    for (const u of users) userNames.set(u.id, u.name);

    const activity: ApiBranchActivity[] = [
      ...recentAudit.map((a) => ({
        id: a.id,
        kind: "audit" as const,
        occurred_at: a.created_at.toISOString(),
        actor_id: a.user_id,
        actor_name: a.user_id ? userNames.get(a.user_id) ?? null : null,
        action: a.action,
        reference: null,
      })),
      ...recentSales.map((s) => ({
        id: s.id,
        kind: "sale" as const,
        occurred_at: s.occurred_at.toISOString(),
        actor_id: s.cashier_id,
        actor_name: userNames.get(s.cashier_id) ?? null,
        action: "sale_completed",
        reference: s.code,
      })),
    ]
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
      .slice(0, 20);

    return {
      id: row.id,
      code: row.code,
      name_i18n: row.name_i18n as { en: string; ar: string },
      address_i18n: (row.address_i18n as { en?: string; ar?: string } | null) ?? null,
      currency_code: row.currency_code,
      timezone: row.timezone,
      is_active: row.is_active,
      opened_at: row.opened_at ? row.opened_at.toISOString().slice(0, 10) : null,
      today_revenue_cents: todayCents,
      staff_count: numberFromCountRow(staffCount[0]?.staff_count),
      product_count: numberFromCountRow(productCount[0]?.product_count),
      geo_lat: decimalToNumber(row.geo_lat),
      geo_lng: decimalToNumber(row.geo_lng),
      operating_hours: (row.operating_hours as OperatingHours | null) ?? null,
      holidays: (row.holidays as Holidays | null) ?? null,
      kpis: {
        today_revenue_cents: todayCents,
        week_revenue_cents: bigintToString(weekRow?.cents),
        transactions_today: todayTxns,
        transactions_week:
          typeof weekRow?.txns === "bigint" ? Number(weekRow.txns) : Number(weekRow?.txns ?? 0),
        top_product_id: topProduct?.product_id ?? null,
        top_product_name: topProduct?.name ?? null,
        units_sold_top_product:
          topProduct?.units !== undefined
            ? typeof topProduct.units === "bigint"
              ? Number(topProduct.units)
              : Number(topProduct.units)
            : 0,
      },
      users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
      recent_activity: activity,
    };
  }

  async listBranchStock(
    tenantId: string,
    branchId: string,
    q: BranchStockQuery,
  ): Promise<{ items: ApiBranchStockRow[]; total: number; page: number; limit: number }> {
    const scoped = tenantScoped(tenantId);
    const branch = await scoped.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.deleted_at) {
      throw new NotFoundException({ code: "branch_not_found", message: "Branch not found" });
    }

    const skip = (q.page - 1) * q.limit;
    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(query: string, ...params: unknown[]) => Promise<T>;
    };

    const searchClause = q.search ? "AND (p.sku ILIKE $3 OR p.name_i18n->>'en' ILIKE $3 OR p.name_i18n->>'ar' ILIKE $3)" : "";
    const lowClause = q.low_only ? "AND bs.reorder_point IS NOT NULL AND bs.qty_on_hand < bs.reorder_point" : "";
    const params: unknown[] = [tenantId, branchId];
    if (q.search) params.push(`%${q.search}%`);

    const rows = await client.$queryRawUnsafe<RawStockRow[]>(
      `SELECT bs.product_id,
              bs.qty_on_hand,
              bs.reorder_point,
              bs.reorder_qty,
              bs.last_movement_at,
              p.sku,
              p.name_i18n,
              p.category_id,
              p.image_url,
              c.code AS category_code
       FROM branch_stock bs
       INNER JOIN products p ON p.id = bs.product_id AND p.deleted_at IS NULL
       LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       WHERE bs.tenant_id = $1::uuid
         AND bs.branch_id = $2::uuid
         AND bs.deleted_at IS NULL
         ${searchClause}
         ${lowClause}
       ORDER BY p.sku ASC
       LIMIT ${q.limit} OFFSET ${skip}`,
      ...params,
    );

    const totalRows = await client.$queryRawUnsafe<Array<{ total: bigint | number }>>(
      `SELECT COUNT(*)::bigint AS total
       FROM branch_stock bs
       INNER JOIN products p ON p.id = bs.product_id AND p.deleted_at IS NULL
       WHERE bs.tenant_id = $1::uuid
         AND bs.branch_id = $2::uuid
         AND bs.deleted_at IS NULL
         ${searchClause}
         ${lowClause}`,
      ...params,
    );
    const total = totalRows[0]
      ? typeof totalRows[0].total === "bigint"
        ? Number(totalRows[0].total)
        : Number(totalRows[0].total)
      : 0;

    return {
      items: rows.map((r) => ({
        product_id: r.product_id,
        sku: r.sku,
        name_i18n: r.name_i18n as { en: string; ar: string },
        category_id: r.category_id,
        category_code: r.category_code,
        qty_on_hand: r.qty_on_hand,
        reorder_point: r.reorder_point,
        reorder_qty: r.reorder_qty,
        // 1.9: a `reserved` column lands with stock transfers. Until then,
        // available == on-hand.
        available: r.qty_on_hand,
        last_movement_at: r.last_movement_at ? r.last_movement_at.toISOString() : null,
        image_url: r.image_url ?? null,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  // ─── mutations ───────────────────────────────────────────────────────────

  async createBranch(
    tenantId: string,
    actorId: string,
    body: CreateBranchBody,
    ctx: AuditCtx,
  ): Promise<ApiBranchDetail> {
    const scoped = tenantScoped(tenantId);
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { default_currency_code: true },
    });
    if (!tenant) {
      throw new UnprocessableEntityException({ code: "tenant_not_found", message: "Tenant not found" });
    }

    let created;
    try {
      created = await scoped.branch.create({
        data: {
          tenant_id: tenantId,
          code: body.code,
          name_i18n: body.name_i18n,
          address_i18n: body.address_i18n ?? undefined,
          currency_code: body.currency_code ?? tenant.default_currency_code,
          timezone: body.timezone ?? "Africa/Cairo",
          opened_at: body.opened_at ? new Date(body.opened_at) : null,
          is_active: body.is_active ?? true,
          operating_hours: body.operating_hours ?? Prisma.DbNull,
          holidays: body.holidays ?? Prisma.DbNull,
          geo_lat: body.geo_lat ?? null,
          geo_lng: body.geo_lng ?? null,
          created_by: actorId,
        },
      });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "code_taken",
          message: "A branch with this code already exists",
          fields: { code: "code_taken" },
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "branch_created",
        entity: "branch",
        entityId: created.id,
        after: {
          code: created.code,
          name_en: (created.name_i18n as { en?: string })?.en ?? null,
          currency_code: created.currency_code,
          timezone: created.timezone,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getBranch(tenantId, created.id);
  }

  async updateBranch(
    tenantId: string,
    branchId: string,
    body: UpdateBranchBody,
    ctx: AuditCtx,
  ): Promise<ApiBranchDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.branch.findUnique({ where: { id: branchId } });
    if (!existing || existing.deleted_at || existing.tenant_id !== tenantId) {
      throw new NotFoundException({ code: "branch_not_found", message: "Branch not found" });
    }

    // Lock currency after first sale: COGS + currency code on sale lines snapshot
    // the branch currency, so swapping mid-life would silently mis-report.
    if (body.currency_code !== undefined && body.currency_code !== existing.currency_code) {
      const salesCount = await scoped.sale.count({ where: { branch_id: branchId } });
      if (salesCount > 0) {
        throw new ConflictException({
          code: "currency_locked_after_sales",
          message: `Cannot change currency: ${salesCount} sale(s) recorded under ${existing.currency_code}`,
        });
      }
    }

    const data: Record<string, unknown> = {};
    if (body.code !== undefined) data.code = body.code;
    if (body.name_i18n !== undefined) data.name_i18n = body.name_i18n;
    if (body.address_i18n !== undefined) data.address_i18n = body.address_i18n;
    if (body.currency_code !== undefined) data.currency_code = body.currency_code;
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.opened_at !== undefined) {
      data.opened_at = body.opened_at === null ? null : new Date(body.opened_at);
    }
    if (body.is_active !== undefined) data.is_active = body.is_active;
    if (body.operating_hours !== undefined) {
      data.operating_hours = body.operating_hours === null ? Prisma.DbNull : body.operating_hours;
    }
    if (body.holidays !== undefined) {
      data.holidays = body.holidays === null ? Prisma.DbNull : body.holidays;
    }
    if (body.geo_lat !== undefined) data.geo_lat = body.geo_lat;
    if (body.geo_lng !== undefined) data.geo_lng = body.geo_lng;

    try {
      await scoped.branch.update({ where: { id: branchId }, data });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "code_taken",
          message: "A branch with this code already exists",
          fields: { code: "code_taken" },
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "branch_updated",
        entity: "branch",
        entityId: branchId,
        before: {
          code: existing.code,
          currency_code: existing.currency_code,
          timezone: existing.timezone,
          is_active: existing.is_active,
        },
        after: body,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getBranch(tenantId, branchId);
  }

  async softDeleteBranch(
    tenantId: string,
    branchId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.branch.findUnique({ where: { id: branchId } });
    if (!existing || existing.tenant_id !== tenantId) {
      throw new NotFoundException({ code: "branch_not_found", message: "Branch not found" });
    }
    if (existing.deleted_at) {
      return { id: existing.id, deleted_at: existing.deleted_at.toISOString() };
    }

    const stockHeld = await scoped.branchStock.count({
      where: { branch_id: branchId, qty_on_hand: { gt: 0 }, deleted_at: null },
    });
    if (stockHeld > 0) {
      throw new ConflictException({
        code: "branch_has_stock",
        message: `Cannot delete branch: ${stockHeld} product(s) still hold on-hand stock at this branch`,
        fields: { stock_rows: stockHeld.toString() },
      });
    }

    const usersAssigned = await scoped.user.count({
      where: { branch_id: branchId, deleted_at: null, is_active: true },
    });
    if (usersAssigned > 0) {
      throw new ConflictException({
        code: "branch_has_users",
        message: `Cannot delete branch: ${usersAssigned} active user(s) are still assigned`,
        fields: { user_count: usersAssigned.toString() },
      });
    }

    const now = new Date();
    await scoped.branch.update({
      where: { id: branchId },
      data: { deleted_at: now, is_active: false },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "branch_deleted",
        entity: "branch",
        entityId: branchId,
        before: { code: existing.code, name_en: (existing.name_i18n as { en?: string })?.en ?? null },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: branchId, deleted_at: now.toISOString() };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async todayRevenuePerBranch(tenantId: string, branchIds: string[]): Promise<BranchRevenueRow[]> {
    if (branchIds.length === 0) return [];
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };
    // Per-branch timezone: "today" in branch local time.
    return client.$queryRawUnsafe<BranchRevenueRow[]>(
      `SELECT s.branch_id,
              COALESCE(SUM(s.total_cents), 0)::bigint AS today_cents,
              COUNT(*)::bigint AS txns_today
       FROM sales s
       INNER JOIN branches b ON b.id = s.branch_id
       WHERE s.tenant_id = $1::uuid
         AND s.branch_id = ANY($2::uuid[])
         AND s.deleted_at IS NULL
         AND s.payment_status IN ('paid', 'payment_pending')
         AND (s.occurred_at AT TIME ZONE b.timezone)::date = (now() AT TIME ZONE b.timezone)::date
       GROUP BY s.branch_id`,
      tenantId,
      branchIds,
    );
  }

  private async weekRevenueForBranch(
    tenantId: string,
    branchId: string,
    timezone: string,
  ): Promise<{ cents: bigint | number | null; txns: bigint | number | null } | null> {
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };
    const rows = await client.$queryRawUnsafe<Array<{ cents: bigint | number; txns: bigint | number }>>(
      `SELECT COALESCE(SUM(total_cents), 0)::bigint AS cents,
              COUNT(*)::bigint AS txns
       FROM sales
       WHERE tenant_id = $1::uuid
         AND branch_id = $2::uuid
         AND deleted_at IS NULL
         AND payment_status IN ('paid', 'payment_pending')
         AND occurred_at >= (now() AT TIME ZONE $3 - INTERVAL '6 days')::date AT TIME ZONE $3`,
      tenantId,
      branchId,
      timezone,
    );
    return rows[0] ?? null;
  }

  private async topProductForBranchToday(
    tenantId: string,
    branchId: string,
    timezone: string,
  ): Promise<{ product_id: string; name: { en: string; ar: string } | null; units: bigint | number } | null> {
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };
    const rows = await client.$queryRawUnsafe<BranchTopProductRow[]>(
      `SELECT sl.product_id,
              SUM(sl.qty)::bigint AS units
       FROM sale_lines sl
       INNER JOIN sales s ON s.id = sl.sale_id
       WHERE s.tenant_id = $1::uuid
         AND s.branch_id = $2::uuid
         AND s.deleted_at IS NULL
         AND s.payment_status IN ('paid', 'payment_pending')
         AND (s.occurred_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date
       GROUP BY sl.product_id
       ORDER BY units DESC
       LIMIT 1`,
      tenantId,
      branchId,
      timezone,
    );
    const top = rows[0];
    if (!top) return null;
    const product = await tenantScoped(tenantId).product.findUnique({
      where: { id: top.product_id },
      select: { name_i18n: true },
    });
    return {
      product_id: top.product_id,
      name: (product?.name_i18n as { en: string; ar: string } | null) ?? null,
      units: top.units,
    };
  }

  private async productCountPerBranch(tenantId: string, branchIds: string[]): Promise<BranchCountRow[]> {
    if (branchIds.length === 0) return [];
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };
    return client.$queryRawUnsafe<BranchCountRow[]>(
      `SELECT bs.branch_id, COUNT(DISTINCT bs.product_id)::bigint AS product_count
       FROM branch_stock bs
       INNER JOIN products p ON p.id = bs.product_id AND p.deleted_at IS NULL
       WHERE bs.tenant_id = $1::uuid
         AND bs.branch_id = ANY($2::uuid[])
         AND bs.deleted_at IS NULL
       GROUP BY bs.branch_id`,
      tenantId,
      branchIds,
    );
  }

  private async staffCountPerBranch(tenantId: string, branchIds: string[]): Promise<BranchStaffCountRow[]> {
    if (branchIds.length === 0) return [];
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...params: unknown[]) => Promise<T>;
    };
    return client.$queryRawUnsafe<BranchStaffCountRow[]>(
      `SELECT branch_id, COUNT(*)::bigint AS staff_count
       FROM users
       WHERE tenant_id = $1::uuid
         AND branch_id = ANY($2::uuid[])
         AND deleted_at IS NULL
         AND is_active = true
       GROUP BY branch_id`,
      tenantId,
      branchIds,
    );
  }

  /**
   * Performance dashboard payload — PAGES.md §24. One method, several raw queries
   * in parallel, all branch-tz aware.
   */
  async getBranchDashboard(tenantId: string, branchId: string): Promise<ApiBranchDashboard> {
    const scoped = tenantScoped(tenantId);
    const branch = await scoped.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.deleted_at) {
      throw new NotFoundException({ code: "branch_not_found", message: "Branch not found" });
    }

    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...p: unknown[]) => Promise<T>;
    };
    const tz = branch.timezone;

    const [
      todayRow,
      yesterdayRow,
      itemsRow,
      returnsRow,
      hourly,
      topCategories,
      leaderboard,
    ] = await Promise.all([
      client.$queryRawUnsafe<Array<{ cents: bigint | number; txns: bigint | number; items: bigint | number }>>(
        `SELECT COALESCE(SUM(s.total_cents), 0)::bigint AS cents,
                COUNT(DISTINCT s.id)::bigint AS txns,
                COALESCE(SUM(sl.qty), 0)::bigint AS items
         FROM sales s
         LEFT JOIN sale_lines sl ON sl.sale_id = s.id
         WHERE s.tenant_id = $1::uuid AND s.branch_id = $2::uuid
           AND s.deleted_at IS NULL
           AND s.payment_status IN ('paid', 'payment_pending')
           AND (s.occurred_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date`,
        tenantId,
        branchId,
        tz,
      ),
      client.$queryRawUnsafe<Array<{ cents: bigint | number }>>(
        `SELECT COALESCE(SUM(total_cents), 0)::bigint AS cents
         FROM sales
         WHERE tenant_id = $1::uuid AND branch_id = $2::uuid
           AND deleted_at IS NULL
           AND payment_status IN ('paid', 'payment_pending')
           AND (occurred_at AT TIME ZONE $3)::date = ((now() AT TIME ZONE $3)::date - INTERVAL '1 day')`,
        tenantId,
        branchId,
        tz,
      ),
      // items_sold_today already included in todayRow
      Promise.resolve([]),
      // returns today (sales tagged as `return_in` movements would be more accurate, but for
      // now return-marked sales is a placeholder — count sales with negative totals or look up
      // refund tx. Here: count returns from sale_lines refund qty if exists; otherwise 0.)
      client.$queryRawUnsafe<Array<{ returns: bigint | number }>>(
        `SELECT 0::bigint AS returns`,
      ),
      client.$queryRawUnsafe<Array<{ hour: number; cents: bigint | number }>>(
        `WITH hours AS (SELECT generate_series(0, 23) AS h)
         SELECT hours.h AS hour,
                COALESCE(SUM(s.total_cents), 0)::bigint AS cents
         FROM hours
         LEFT JOIN sales s
           ON s.tenant_id = $1::uuid
          AND s.branch_id = $2::uuid
          AND s.deleted_at IS NULL
          AND s.payment_status IN ('paid', 'payment_pending')
          AND (s.occurred_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date
          AND EXTRACT(HOUR FROM (s.occurred_at AT TIME ZONE $3)) = hours.h
         GROUP BY hours.h
         ORDER BY hours.h`,
        tenantId,
        branchId,
        tz,
      ),
      // Top categories — 7-day rolling window, revenue per category
      client.$queryRawUnsafe<Array<{ category_id: string | null; category_code: string | null; name_i18n: unknown; cents: bigint | number }>>(
        `SELECT c.id AS category_id,
                c.code AS category_code,
                c.name_i18n,
                COALESCE(SUM(sl.line_total_cents), 0)::bigint AS cents
         FROM sale_lines sl
         INNER JOIN sales s ON s.id = sl.sale_id
         INNER JOIN products p ON p.id = sl.product_id
         LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
         WHERE s.tenant_id = $1::uuid
           AND s.branch_id = $2::uuid
           AND s.deleted_at IS NULL
           AND s.payment_status IN ('paid', 'payment_pending')
           AND s.occurred_at >= (now() AT TIME ZONE $3 - INTERVAL '6 days')::date AT TIME ZONE $3
         GROUP BY c.id, c.code, c.name_i18n
         ORDER BY cents DESC
         LIMIT 6`,
        tenantId,
        branchId,
        tz,
      ),
      // Leaderboard — today's revenue across all branches in the tenant
      client.$queryRawUnsafe<Array<{ branch_id: string; cents: bigint | number; name_i18n: unknown }>>(
        `SELECT b.id AS branch_id,
                b.name_i18n,
                COALESCE(SUM(s.total_cents), 0)::bigint AS cents
         FROM branches b
         LEFT JOIN sales s
           ON s.tenant_id = $1::uuid
          AND s.branch_id = b.id
          AND s.deleted_at IS NULL
          AND s.payment_status IN ('paid', 'payment_pending')
          AND (s.occurred_at AT TIME ZONE b.timezone)::date = (now() AT TIME ZONE b.timezone)::date
         WHERE b.tenant_id = $1::uuid
           AND b.deleted_at IS NULL
           AND b.is_active = true
         GROUP BY b.id, b.name_i18n
         ORDER BY cents DESC`,
        tenantId,
      ),
    ]);

    const today = todayRow[0] ?? { cents: 0n, txns: 0n, items: 0n };
    const yesterday = yesterdayRow[0] ?? { cents: 0n };
    const todayCents = typeof today.cents === "bigint" ? Number(today.cents) : Number(today.cents);
    const yesterdayCents = typeof yesterday.cents === "bigint" ? Number(yesterday.cents) : Number(yesterday.cents);
    const txns = typeof today.txns === "bigint" ? Number(today.txns) : Number(today.txns);
    const items = typeof today.items === "bigint" ? Number(today.items) : Number(today.items);
    const yoY = yesterdayCents > 0 ? Math.round(((todayCents - yesterdayCents) / yesterdayCents) * 100) : null;
    const avgBasketCents = txns > 0 ? Math.round(todayCents / txns) : 0;
    const returns = returnsRow[0]
      ? typeof returnsRow[0].returns === "bigint"
        ? Number(returnsRow[0].returns)
        : Number(returnsRow[0].returns)
      : 0;
    void itemsRow; // placeholder branch — items already on todayRow

    const leaderboardItems = leaderboard.map((r, i) => ({
      branch_id: r.branch_id,
      name_i18n: (r.name_i18n as { en: string; ar: string }) ?? { en: "", ar: "" },
      today_cents: typeof r.cents === "bigint" ? r.cents.toString() : String(r.cents),
      rank: i + 1,
    }));
    const myRank = leaderboardItems.find((b) => b.branch_id === branchId)?.rank ?? null;

    return {
      branch_id: branchId,
      branch_name_i18n: branch.name_i18n as { en: string; ar: string },
      currency_code: branch.currency_code,
      today_cents: todayCents.toString(),
      yesterday_cents: yesterdayCents.toString(),
      vs_yesterday_pct: yoY,
      transactions_today: txns,
      items_sold_today: items,
      avg_basket_cents: avgBasketCents.toString(),
      returns_today: returns,
      hourly: hourly.map((h) => ({
        hour: h.hour,
        cents: typeof h.cents === "bigint" ? Number(h.cents) : Number(h.cents),
      })),
      top_categories: topCategories.map((c) => ({
        category_id: c.category_id,
        category_code: c.category_code,
        name_i18n: (c.name_i18n as { en: string; ar: string } | null) ?? null,
        cents: typeof c.cents === "bigint" ? Number(c.cents) : Number(c.cents),
      })),
      leaderboard: leaderboardItems,
      my_rank: myRank,
    };
  }

  /** Assert the actor may write to this specific branch. Owner: any branch. Manager: only their assigned branch. */
  assertCanWriteToBranch(actor: { role: string; userId: string }, branchId: string, actorAssignedBranchId: string | null): void {
    if (actor.role === "owner") return;
    if (actor.role === "manager" && actorAssignedBranchId === branchId) return;
    throw new BadRequestException({
      code: "forbidden_branch",
      message: "You can only edit your own branch",
    });
  }
}

function bigintToString(v: bigint | number | null | undefined): string {
  if (v == null) return "0";
  if (typeof v === "bigint") return v.toString();
  return String(v);
}

function numberFromCountRow(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}

function decimalToNumber(v: Prisma.Decimal | null | undefined): number | null {
  if (v == null) return null;
  return Number(v.toString());
}

interface RawStockRow {
  product_id: string;
  qty_on_hand: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  last_movement_at: Date | null;
  sku: string;
  name_i18n: unknown;
  category_id: string | null;
  category_code: string | null;
  image_url: string | null;
}
