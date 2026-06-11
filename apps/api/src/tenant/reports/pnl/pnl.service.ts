import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
// Tenant.default_currency_code lives on the platform-scoped tenants table.
// Mirrors the dashboard escape hatch — narrow, read-only.
// eslint-disable-next-line no-restricted-imports
import { tenantScoped } from "@madar/db";
import type { PnlQuery } from "./dto/pnl.dto";

const READER_ROLES = new Set(["owner", "manager", "accountant", "auditor"]);

export interface PnlBreakdownRow {
  key: string;
  label_i18n: { en: string; ar: string } | null;
  label?: string;
  revenue_cents: string;
  cogs_cents: string;
  gross_profit_cents: string;
  transactions: number;
}

export interface ApiPnlReport {
  currency: string;
  from: string;
  to: string;
  period_label: string;
  revenue_cents: string;
  discount_cents: string;
  tax_cents: string;
  cogs_cents: string;
  gross_profit_cents: string;
  gross_profit_pct: number;
  refunds_cents: string;
  net_revenue_cents: string;
  transactions: number;
  mixed_currency_warning: boolean;
  breakdown: PnlBreakdownRow[];
}

interface TotalsRow {
  revenue_cents: bigint | number | null;
  discount_cents: bigint | number | null;
  tax_cents: bigint | number | null;
  cogs_cents: bigint | number | null;
  refunds_cents: bigint | number | null;
  transactions: bigint | number | null;
}

interface BreakdownRowRaw {
  k: string | Date | null;
  label_i18n: unknown;
  revenue_cents: bigint | number | null;
  cogs_cents: bigint | number | null;
  transactions: bigint | number | null;
}

interface MixedCurrencyRow {
  c: bigint | number | null;
}

interface SqlBuild {
  sql: string;
  params: unknown[];
}

@Injectable()
export class PnlService {
  private readonly logger = new Logger(PnlService.name);

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to view the P&L report",
      });
    }
  }

  async generate(tenantId: string, q: PnlQuery): Promise<ApiPnlReport> {
    const scoped = tenantScoped(tenantId);
    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(sql: string, ...p: unknown[]) => Promise<T>;
    };

    const totals = this.buildTotalsSql(tenantId, q);
    const breakdown = this.buildBreakdownSql(tenantId, q);

    const [totalsRows, mixedRows, breakdownRows] = await Promise.all([
      client.$queryRawUnsafe<TotalsRow[]>(totals.sql, ...totals.params),
      client.$queryRawUnsafe<MixedCurrencyRow[]>(
        `SELECT COUNT(DISTINCT currency_code)::bigint AS c
           FROM branches
          WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
        tenantId,
      ),
      client.$queryRawUnsafe<BreakdownRowRaw[]>(breakdown.sql, ...breakdown.params),
    ]);

    const t = totalsRows[0];
    const revenue = toBig(t?.revenue_cents);
    const discount = toBig(t?.discount_cents);
    const tax = toBig(t?.tax_cents);
    const cogs = toBig(t?.cogs_cents);
    const refunds = toBig(t?.refunds_cents);
    const transactions = toNumber(t?.transactions);

    // total_cents is ALREADY net of discount (sales.service computes
    // total = subtotal − discount [+ tax]) — subtracting discount again here
    // was audit finding H-4 (gross profit understated by every discount).
    // discount_cents stays in the response as an informational line.
    const grossProfit = revenue - tax - cogs;
    // Refunds are subtracted exactly once, from revenue (M-13): refunded
    // sales remain IN revenue and partial refunds are captured via
    // refunded_amount_cents.
    const netRevenue = revenue - refunds;
    const grossProfitPct =
      revenue > 0n
        ? Math.round((Number(grossProfit) / Number(revenue)) * 10000) / 100
        : 0;

    return {
      currency: q.currency,
      from: q.from,
      to: q.to,
      period_label: buildPeriodLabel(q.from, q.to),
      revenue_cents: revenue.toString(),
      discount_cents: discount.toString(),
      tax_cents: tax.toString(),
      cogs_cents: cogs.toString(),
      gross_profit_cents: grossProfit.toString(),
      gross_profit_pct: grossProfitPct,
      refunds_cents: refunds.toString(),
      net_revenue_cents: netRevenue.toString(),
      transactions,
      mixed_currency_warning: toNumber(mixedRows[0]?.c) > 1,
      breakdown: breakdownRows.map((r) => shapeBreakdownRow(r, q.group_by)),
    };
  }

  // ─── totals (whole-period, single row) ─────────────────────────────
  //
  // When a category filter is present we narrow to sales that have at
  // least one line in that category. Sale-level totals (revenue/discount/
  // tax/refunds) are summed across those sales unchanged — partial
  // attribution per category is out of scope for the statement view; the
  // breakdown handles the per-category split via line totals.
  //
  // cogs_snapshot_cents is already per-line total (sales.service.ts:154).
  // Do NOT multiply by sl.qty.
  private buildTotalsSql(tenantId: string, q: PnlQuery): SqlBuild {
    const params: unknown[] = [tenantId, q.currency, `${q.from} 00:00:00+00`, `${q.to} 00:00:00+00`];
    const branchClause = q.branch_id
      ? ` AND s.branch_id = $${pushParam(params, q.branch_id)}::uuid`
      : "";
    const categoryFragment = q.category_id
      ? this.matchingSalesByCategory(params, q.category_id)
      : { join: "", where: "" };

    const sql = `
      WITH matching_sales AS (
        SELECT DISTINCT s.id, s.total_cents, s.discount_cents, s.tax_cents,
                        s.refunded_amount_cents, s.payment_status, s.currency_code
        FROM sales s
        ${categoryFragment.join}
        WHERE s.tenant_id = $1::uuid
          AND s.deleted_at IS NULL
          AND s.occurred_at >= $3::timestamptz
          AND s.occurred_at <  ($4::timestamptz + interval '1 day')
          ${branchClause}
          ${categoryFragment.where}
      ),
      sale_totals AS (
        -- Revenue is GROSS of refunds: refunded sales were collected, then
        -- returned — they stay in revenue and the refund shows in
        -- refunds_cents (SUM of refunded_amount_cents, which also captures
        -- PARTIAL refunds on sales that are still 'paid'). Net revenue =
        -- revenue − refunds downstream.
        SELECT
          COALESCE(SUM(total_cents)            FILTER (WHERE payment_status IN ('paid','payment_pending','refunded') AND currency_code = $2), 0)::bigint AS revenue_cents,
          COALESCE(SUM(discount_cents)         FILTER (WHERE payment_status IN ('paid','payment_pending','refunded') AND currency_code = $2), 0)::bigint AS discount_cents,
          COALESCE(SUM(tax_cents)              FILTER (WHERE payment_status IN ('paid','payment_pending','refunded') AND currency_code = $2), 0)::bigint AS tax_cents,
          COALESCE(SUM(refunded_amount_cents)  FILTER (WHERE currency_code = $2), 0)::bigint AS refunds_cents,
          COUNT(DISTINCT id) FILTER (WHERE payment_status IN ('paid','payment_pending','refunded') AND currency_code = $2)::bigint AS transactions
        FROM matching_sales
      ),
      line_totals AS (
        SELECT COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0)), 0)::bigint AS cogs_cents
        FROM matching_sales ms
        INNER JOIN sale_lines sl ON sl.sale_id = ms.id AND sl.deleted_at IS NULL
        WHERE ms.payment_status IN ('paid','payment_pending','refunded')
          AND ms.currency_code = $2
      )
      SELECT sale_totals.revenue_cents,
             sale_totals.discount_cents,
             sale_totals.tax_cents,
             line_totals.cogs_cents,
             sale_totals.refunds_cents,
             sale_totals.transactions
      FROM sale_totals, line_totals
    `;
    return { sql, params };
  }

  private matchingSalesByCategory(params: unknown[], categoryId: string) {
    const idx = pushParam(params, categoryId);
    return {
      join: ` INNER JOIN sale_lines sl ON sl.sale_id = s.id AND sl.deleted_at IS NULL
              INNER JOIN products p   ON p.id = sl.product_id`,
      where: ` AND p.category_id = $${idx}::uuid`,
    };
  }

  // ─── breakdown ─────────────────────────────────────────────────────
  private buildBreakdownSql(tenantId: string, q: PnlQuery): SqlBuild {
    const params: unknown[] = [tenantId, q.currency, `${q.from} 00:00:00+00`, `${q.to} 00:00:00+00`];
    const branchClause = q.branch_id
      ? ` AND s.branch_id = $${pushParam(params, q.branch_id)}::uuid`
      : "";
    const categoryClause = q.category_id
      ? ` AND p.category_id = $${pushParam(params, q.category_id)}::uuid`
      : "";

    const linesWhere = `
      WHERE s.tenant_id = $1::uuid
        AND s.deleted_at IS NULL
        AND sl.deleted_at IS NULL
        AND s.payment_status IN ('paid','payment_pending','refunded')
        AND s.currency_code = $2
        AND s.occurred_at >= $3::timestamptz
        AND s.occurred_at <  ($4::timestamptz + interval '1 day')
        ${branchClause}
        ${categoryClause}
    `;

    if (q.group_by === "period") {
      // Per-day rollup of lines, plus a `days` series so empty days appear.
      const sql = `
        WITH lines_per_day AS (
          SELECT s.occurred_at::date AS d,
                 SUM(sl.line_total_cents)::bigint AS revenue_cents,
                 SUM(COALESCE(sl.cogs_snapshot_cents, 0))::bigint AS cogs_cents,
                 COUNT(DISTINCT s.id)::bigint AS transactions
          FROM sale_lines sl
          INNER JOIN sales s    ON s.id = sl.sale_id
          ${q.category_id ? "INNER JOIN products p ON p.id = sl.product_id" : ""}
          ${linesWhere}
          GROUP BY s.occurred_at::date
        ),
        days AS (
          SELECT generate_series($3::timestamptz::date, $4::timestamptz::date, interval '1 day')::date AS d
        )
        SELECT days.d::text AS k,
               NULL::jsonb AS label_i18n,
               COALESCE(lpd.revenue_cents, 0)::bigint AS revenue_cents,
               COALESCE(lpd.cogs_cents, 0)::bigint AS cogs_cents,
               COALESCE(lpd.transactions, 0)::bigint AS transactions
        FROM days
        LEFT JOIN lines_per_day lpd ON lpd.d = days.d
        ORDER BY days.d ASC
      `;
      return { sql, params };
    }

    if (q.group_by === "branch") {
      const sql = `
        SELECT b.id::text AS k,
               b.name_i18n AS label_i18n,
               COALESCE(SUM(sl.line_total_cents), 0)::bigint AS revenue_cents,
               COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0)), 0)::bigint AS cogs_cents,
               COUNT(DISTINCT s.id)::bigint AS transactions
        FROM sale_lines sl
        INNER JOIN sales s ON s.id = sl.sale_id
        INNER JOIN branches b ON b.id = s.branch_id
        ${q.category_id ? "INNER JOIN products p ON p.id = sl.product_id" : ""}
        ${linesWhere}
          AND b.deleted_at IS NULL
        GROUP BY b.id, b.name_i18n
        ORDER BY revenue_cents DESC
      `;
      return { sql, params };
    }

    if (q.group_by === "category") {
      const sql = `
        SELECT COALESCE(c.id::text, 'uncategorized') AS k,
               c.name_i18n AS label_i18n,
               COALESCE(SUM(sl.line_total_cents), 0)::bigint AS revenue_cents,
               COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0)), 0)::bigint AS cogs_cents,
               COUNT(DISTINCT s.id)::bigint AS transactions
        FROM sale_lines sl
        INNER JOIN sales s    ON s.id = sl.sale_id
        INNER JOIN products p ON p.id = sl.product_id
        LEFT  JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
        ${linesWhere}
        GROUP BY c.id, c.name_i18n
        ORDER BY revenue_cents DESC
      `;
      return { sql, params };
    }

    // group_by === "sku"
    const sql = `
      SELECT sl.product_id::text AS k,
             p.name_i18n AS label_i18n,
             COALESCE(SUM(sl.line_total_cents), 0)::bigint AS revenue_cents,
             COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0)), 0)::bigint AS cogs_cents,
             COUNT(DISTINCT s.id)::bigint AS transactions
      FROM sale_lines sl
      INNER JOIN sales s    ON s.id = sl.sale_id
      INNER JOIN products p ON p.id = sl.product_id
      ${linesWhere}
      GROUP BY sl.product_id, p.name_i18n
      ORDER BY revenue_cents DESC
      LIMIT 200
    `;
    return { sql, params };
  }
}

function pushParam(params: unknown[], v: unknown): number {
  params.push(v);
  return params.length;
}

function toBig(v: bigint | number | null | undefined): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  return BigInt(v);
}

function toNumber(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

function shapeBreakdownRow(
  r: BreakdownRowRaw,
  groupBy: "period" | "branch" | "category" | "sku",
): PnlBreakdownRow {
  const key = r.k == null ? "" : typeof r.k === "string" ? r.k : (r.k as Date).toISOString();
  const revenue = toBig(r.revenue_cents);
  const cogs = toBig(r.cogs_cents);
  const gp = revenue - cogs;
  const base: PnlBreakdownRow = {
    key,
    label_i18n: (r.label_i18n as { en: string; ar: string } | null) ?? null,
    revenue_cents: revenue.toString(),
    cogs_cents: cogs.toString(),
    gross_profit_cents: gp.toString(),
    transactions: toNumber(r.transactions),
  };
  if (groupBy === "period") {
    base.label_i18n = null;
    base.label = key;
  }
  return base;
}

function buildPeriodLabel(from: string, to: string): string {
  if (from === to) return from;
  const f = new Date(from);
  const t = new Date(to);
  if (
    f.getUTCFullYear() === t.getUTCFullYear() &&
    f.getUTCMonth() === t.getUTCMonth() &&
    f.getUTCDate() === 1
  ) {
    // Single calendar-month span if `to` is the last day of the same month.
    const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    if (t.getUTCDate() === lastDay) {
      const m = f.toLocaleString("en", { month: "long", timeZone: "UTC" });
      return `${m} ${f.getUTCFullYear()}`;
    }
  }
  return "Custom range";
}
