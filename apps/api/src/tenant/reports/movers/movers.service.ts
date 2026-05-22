import { ForbiddenException, Injectable } from "@nestjs/common";
// eslint-disable-next-line no-restricted-imports
import { tenantScoped } from "@madar/db";
import type { MoversQuery } from "./dto/movers.dto";

/**
 * Reader roles for read-only reporting endpoints. Mirrors the dashboard reader
 * set + `auditor` (per Slice 2 spec — accountants and auditors both need
 * margin / movers analytics).
 */
const READER_ROLES = new Set(["owner", "manager", "accountant", "auditor"]);

const SLOW_MOVERS_LIMIT = 10;
const SLOW_MOVERS_UNIT_THRESHOLD = 5;

export interface MoverItem {
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  category_id: string | null;
  category_name_i18n: { en: string; ar: string } | null;
  revenue_cents: string;
  units: number;
  cogs_cents: string;
  gross_profit_cents: string;
  gross_profit_pct: number;
  sparkline_7d: number[];
}

export interface ApiMoversResponse {
  currency: string;
  from: string;
  to: string;
  metric: "revenue" | "units" | "profit";
  items: MoverItem[];
  slow_movers: MoverItem[];
}

interface MoverRow {
  product_id: string;
  sku: string;
  name_i18n: unknown;
  category_id: string | null;
  category_name_i18n: unknown;
  revenue_cents: bigint | number | null;
  units: bigint | number | null;
  cogs_cents: bigint | number | null;
  gross_profit_cents: bigint | number | null;
}

interface SparklineRow {
  product_id: string;
  day_idx: number;
  cents: bigint | number | null;
}

interface SlowMoverRow extends MoverRow {}

@Injectable()
export class MoversService {
  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to view movers reports",
      });
    }
  }

  async getMovers(tenantId: string, q: MoversQuery): Promise<ApiMoversResponse> {
    const scoped = tenantScoped(tenantId);
    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(qq: string, ...p: unknown[]) => Promise<T>;
    };

    // Sort expression keyed off `metric`. Cents-typed columns are bigint, so
    // we order DESC NULLS LAST and break ties by product_id for determinism.
    const orderExpr =
      q.metric === "units"
        ? "agg.units DESC, agg.revenue_cents DESC"
        : q.metric === "profit"
          ? "agg.gross_profit_cents DESC, agg.revenue_cents DESC"
          : "agg.revenue_cents DESC, agg.units DESC";

    const branchClause = q.branch_id ? "AND s.branch_id = $4::uuid" : "";
    const categoryClause = q.category_id
      ? // Position depends on whether branch was set first.
        q.branch_id
        ? "AND p.category_id = $5::uuid"
        : "AND p.category_id = $4::uuid"
      : "";

    const baseParams: unknown[] = [tenantId, q.currency, `${q.from} 00:00:00+00`, `${q.to} 23:59:59.999+00`];
    if (q.branch_id) baseParams.push(q.branch_id);
    if (q.category_id) baseParams.push(q.category_id);

    // ─── Top-N movers (sorted by metric) ────────────────────────────────
    // We aggregate revenue/units/cogs/profit per product across the window
    // and pull product + category labels in one shot.
    const moversSql = `
      WITH agg AS (
        SELECT sl.product_id,
               COALESCE(SUM(sl.line_total_cents), 0)::bigint                                       AS revenue_cents,
               COALESCE(SUM(sl.qty), 0)::bigint                                                    AS units,
               COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty), 0)::bigint              AS cogs_cents,
               (COALESCE(SUM(sl.line_total_cents), 0)
                  - COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty), 0))::bigint        AS gross_profit_cents
        FROM sale_lines sl
        INNER JOIN sales s    ON s.id         = sl.sale_id
        INNER JOIN products p ON p.id         = sl.product_id
        WHERE s.tenant_id = $1::uuid
          AND s.deleted_at IS NULL
          AND sl.deleted_at IS NULL
          AND s.payment_status IN ('paid', 'payment_pending')
          AND s.currency_code = $2
          AND s.occurred_at >= $3::timestamptz
          AND s.occurred_at <= $4::timestamptz
          ${branchClause}
          ${categoryClause}
        GROUP BY sl.product_id
      )
      SELECT agg.product_id,
             p.sku,
             p.name_i18n,
             p.category_id,
             c.name_i18n                  AS category_name_i18n,
             agg.revenue_cents,
             agg.units,
             agg.cogs_cents,
             agg.gross_profit_cents
      FROM agg
      INNER JOIN products  p ON p.id = agg.product_id
      LEFT  JOIN categories c ON c.id = p.category_id
      ORDER BY ${orderExpr}, agg.product_id ASC
      LIMIT ${q.limit}`;

    const movers = await client.$queryRawUnsafe<MoverRow[]>(moversSql, ...baseParams);

    // ─── 7-day revenue sparkline per top product ────────────────────────
    // Run only when we have movers — otherwise skip the trip. We bucket by
    // calendar day, 0..6 == last-7-days inclusive of `to`, oldest first.
    const productIds = movers.map((r) => r.product_id);
    const sparklineMap = new Map<string, number[]>();
    if (productIds.length > 0) {
      const sparkParams: unknown[] = [
        tenantId,
        q.currency,
        `${q.to} 23:59:59.999+00`,
        productIds,
      ];
      const sparkSql = `
        WITH days AS (
          SELECT generate_series(($3::timestamptz)::date - 6,
                                 ($3::timestamptz)::date,
                                 interval '1 day')::date AS d
        ),
        per_day AS (
          SELECT sl.product_id,
                 s.occurred_at::date AS d,
                 COALESCE(SUM(sl.line_total_cents), 0)::bigint AS cents
          FROM sale_lines sl
          INNER JOIN sales s ON s.id = sl.sale_id
          WHERE s.tenant_id = $1::uuid
            AND s.deleted_at IS NULL
            AND sl.deleted_at IS NULL
            AND s.payment_status IN ('paid', 'payment_pending')
            AND s.currency_code = $2
            AND s.occurred_at >= ($3::timestamptz)::date - 6
            AND s.occurred_at <  ($3::timestamptz)::date + 1
            AND sl.product_id = ANY($4::uuid[])
          GROUP BY sl.product_id, s.occurred_at::date
        )
        SELECT pids.product_id,
               (days.d - (($3::timestamptz)::date - 6))::int AS day_idx,
               COALESCE(per_day.cents, 0)::bigint            AS cents
        FROM (SELECT UNNEST($4::uuid[]) AS product_id) pids
        CROSS JOIN days
        LEFT JOIN per_day
          ON per_day.product_id = pids.product_id
         AND per_day.d          = days.d
        ORDER BY pids.product_id, days.d`;

      const sparkRows = await client.$queryRawUnsafe<SparklineRow[]>(sparkSql, ...sparkParams);
      for (const row of sparkRows) {
        const arr = sparklineMap.get(row.product_id) ?? new Array(7).fill(0);
        const idx = Math.max(0, Math.min(6, row.day_idx));
        arr[idx] = toNumber(row.cents);
        sparklineMap.set(row.product_id, arr);
      }
    }

    // ─── Slow movers ────────────────────────────────────────────────────
    // Products with stock on hand > 0 in any branch AND fewer than
    // SLOW_MOVERS_UNIT_THRESHOLD units sold across the same window.
    // We exclude products that are missing entirely from sale_lines via the
    // INNER JOIN substitute: COALESCE of LEFT JOIN keeps them eligible.
    const slowBranchClause = q.branch_id ? "AND bs.branch_id = $4::uuid" : "";
    const slowCategoryClause = q.category_id
      ? q.branch_id
        ? "AND p.category_id = $5::uuid"
        : "AND p.category_id = $4::uuid"
      : "";

    const slowSql = `
      WITH stocked AS (
        SELECT bs.product_id, COALESCE(SUM(bs.qty_on_hand), 0)::int AS qty
        FROM branch_stock bs
        INNER JOIN branches b ON b.id = bs.branch_id
        INNER JOIN products p ON p.id = bs.product_id
        WHERE bs.tenant_id = $1::uuid
          AND bs.deleted_at IS NULL
          AND b.deleted_at IS NULL
          AND b.is_active = true
          AND p.deleted_at IS NULL
          AND p.is_active = true
          ${slowBranchClause}
          ${slowCategoryClause}
        GROUP BY bs.product_id
        HAVING COALESCE(SUM(bs.qty_on_hand), 0) > 0
      ),
      sold AS (
        SELECT sl.product_id,
               COALESCE(SUM(sl.line_total_cents), 0)::bigint                                       AS revenue_cents,
               COALESCE(SUM(sl.qty), 0)::bigint                                                    AS units,
               COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty), 0)::bigint              AS cogs_cents,
               (COALESCE(SUM(sl.line_total_cents), 0)
                  - COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty), 0))::bigint        AS gross_profit_cents
        FROM sale_lines sl
        INNER JOIN sales s ON s.id = sl.sale_id
        WHERE s.tenant_id = $1::uuid
          AND s.deleted_at IS NULL
          AND sl.deleted_at IS NULL
          AND s.payment_status IN ('paid', 'payment_pending')
          AND s.currency_code = $2
          AND s.occurred_at >= $3::timestamptz
          AND s.occurred_at <= $4::timestamptz
          ${branchClause}
        GROUP BY sl.product_id
      )
      SELECT p.id                                  AS product_id,
             p.sku,
             p.name_i18n,
             p.category_id,
             c.name_i18n                           AS category_name_i18n,
             COALESCE(sold.revenue_cents, 0)::bigint        AS revenue_cents,
             COALESCE(sold.units, 0)::bigint                AS units,
             COALESCE(sold.cogs_cents, 0)::bigint           AS cogs_cents,
             COALESCE(sold.gross_profit_cents, 0)::bigint   AS gross_profit_cents
      FROM stocked
      INNER JOIN products  p ON p.id = stocked.product_id
      LEFT  JOIN categories c ON c.id = p.category_id
      LEFT  JOIN sold          ON sold.product_id = p.id
      WHERE COALESCE(sold.units, 0) < ${SLOW_MOVERS_UNIT_THRESHOLD}
      ORDER BY COALESCE(sold.units, 0) ASC,
               COALESCE(sold.revenue_cents, 0) ASC,
               p.id ASC
      LIMIT ${SLOW_MOVERS_LIMIT}`;

    const slowRows = await client.$queryRawUnsafe<SlowMoverRow[]>(slowSql, ...baseParams);

    return {
      currency: q.currency,
      from: q.from,
      to: q.to,
      metric: q.metric,
      items: movers.map((r) => shapeMover(r, sparklineMap.get(r.product_id) ?? new Array(7).fill(0))),
      slow_movers: slowRows.map((r) => shapeMover(r, new Array(7).fill(0))),
    };
  }
}

function shapeMover(row: MoverRow, sparkline: number[]): MoverItem {
  const revenue = toBigIntSafe(row.revenue_cents);
  const cogs = toBigIntSafe(row.cogs_cents);
  const profit = toBigIntSafe(row.gross_profit_cents);
  const revenueNum = Number(revenue);
  const profitNum = Number(profit);
  const pct = revenueNum > 0 ? Math.round((profitNum / revenueNum) * 10_000) / 100 : 0;

  return {
    product_id: row.product_id,
    sku: row.sku,
    name_i18n: coerceI18n(row.name_i18n),
    category_id: row.category_id,
    category_name_i18n: row.category_name_i18n ? coerceI18n(row.category_name_i18n) : null,
    revenue_cents: revenue.toString(),
    units: toNumber(row.units),
    cogs_cents: cogs.toString(),
    gross_profit_cents: profit.toString(),
    gross_profit_pct: pct,
    sparkline_7d: sparkline.slice(0, 7),
  };
}

function coerceI18n(v: unknown): { en: string; ar: string } {
  if (v && typeof v === "object") {
    const obj = v as { en?: unknown; ar?: unknown };
    return {
      en: typeof obj.en === "string" ? obj.en : "",
      ar: typeof obj.ar === "string" ? obj.ar : "",
    };
  }
  return { en: "", ar: "" };
}

function toBigIntSafe(v: bigint | number | null | undefined): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  return BigInt(Math.trunc(v));
}

function toNumber(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}
