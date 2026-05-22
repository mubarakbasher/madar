import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
// The owner dashboard reads tenant.default_currency_code from the platform-
// scoped tenants table (no tenant_id column, not under RLS). Mirrors the
// branches/suppliers escape hatch — narrowly scoped, single-column read.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { computeInsights, type InsightLeaderboardRow } from "./dashboard.insights";

const READER_ROLES = new Set(["owner", "manager", "accountant"]);

export interface ApiOwnerDashboard {
  currency_code: string;
  mixed_currency_warning: boolean;
  generated_at: string;

  week: {
    revenue_cents: string;
    transactions: number;
    items_sold: number;
    gross_profit_cents: string;
    avg_basket_cents: string;
  };
  prev_week: {
    revenue_cents: string;
    transactions: number;
    gross_profit_cents: string;
  };
  vs_prev_week: {
    revenue_pct: number | null;
    transactions_pct: number | null;
    gross_profit_pct: number | null;
  };

  revenue_30d: Array<{ date: string; cents: number }>;

  sparklines: {
    revenue_cents: number[];
    transactions: number[];
    gross_profit_cents: number[];
  };

  leaderboard: Array<{
    branch_id: string;
    code: string;
    name_i18n: { en: string; ar: string } | null;
    revenue_cents: string;
    transactions: number;
    vs_prev_week_pct: number | null;
  }>;

  heatmap: number[][];

  recent_transactions: Array<{
    id: string;
    code: string;
    branch_id: string;
    branch_code: string;
    cashier_id: string | null;
    cashier_name: string | null;
    items: number;
    total_cents: string;
    payment_method: string;
    payment_status: "paid" | "payment_pending" | "disputed" | "refunded";
    occurred_at: string;
  }>;

  insights: Array<{
    id: string;
    kind:
      | "branch_decline"
      | "concentration"
      | "stale_payment_proof"
      | "low_stock_critical"
      | "growth_winner"
      | "week_recap";
    urgency: "high" | "medium" | "low";
    headline_i18n: { en: string; ar: string };
    body_i18n: { en: string; ar: string };
    confidence: number;
    actions: Array<{ label_i18n: { en: string; ar: string }; href: string }>;
  }>;
}

interface WeekMetricsRow {
  bucket: "this_week" | "prev_week";
  revenue_cents: bigint | number | null;
  transactions: bigint | number | null;
  items_sold: bigint | number | null;
  gross_profit_cents: bigint | number | null;
}

interface Revenue30Row {
  date: Date;
  cents: bigint | number | null;
}

interface SparklineRow {
  date: Date;
  revenue_cents: bigint | number | null;
  transactions: bigint | number | null;
  gross_profit_cents: bigint | number | null;
}

interface LeaderboardRow {
  branch_id: string;
  code: string;
  name_i18n: unknown;
  revenue_cents: bigint | number | null;
  transactions: bigint | number | null;
  prev_revenue_cents: bigint | number | null;
}

interface HeatmapRow {
  dow_idx: number;
  hour_idx: number;
  cents: bigint | number | null;
}

interface RecentTxRow {
  id: string;
  code: string;
  branch_id: string;
  branch_code: string;
  cashier_id: string | null;
  cashier_name: string | null;
  items: bigint | number | null;
  total_cents: bigint | number;
  payment_method: string;
  payment_status: "paid" | "payment_pending" | "disputed" | "refunded";
  occurred_at: Date;
}

interface TopProductRow {
  product_id: string;
  name_i18n: unknown;
  revenue_cents: bigint | number;
}

interface CountRow {
  c: bigint | number;
}

interface MixedCurrencyRow {
  has_mixed: boolean;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to view the chain dashboard",
      });
    }
  }

  async getOwnerDashboard(tenantId: string): Promise<ApiOwnerDashboard> {
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { default_currency_code: true },
    });
    const currency = tenant?.default_currency_code ?? "USD";

    const scoped = tenantScoped(tenantId);
    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...p: unknown[]) => Promise<T>;
    };

    // weekStart anchors the insight ID hashes — same logical Monday boundary
    // that the 7-day window uses (we use [now-7d, now) so the "week" floats
    // by hour, but the ID just needs to be stable within a 24 h block).
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);

    const [
      weekMetrics,
      revenue30d,
      sparklines,
      leaderboard,
      heatmap,
      recentTx,
      topProduct,
      stalePaymentProofs,
      lowStockCount,
      mixedCurrency,
    ] = await Promise.all([
      client.$queryRawUnsafe<WeekMetricsRow[]>(
        `WITH bounds AS (
            SELECT now() AS now_ts,
                   now() - interval '7 days' AS week_start,
                   now() - interval '14 days' AS prev_week_start
         )
         SELECT 'this_week'::text AS bucket,
                COALESCE(SUM(s.total_cents) FILTER (WHERE s.currency_code = $2), 0)::bigint AS revenue_cents,
                COUNT(DISTINCT s.id)::bigint AS transactions,
                COALESCE(SUM(sl.qty), 0)::bigint AS items_sold,
                (COALESCE(SUM(s.total_cents) FILTER (WHERE s.currency_code = $2), 0)
                  - COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty)
                       FILTER (WHERE s.currency_code = $2), 0))::bigint AS gross_profit_cents
         FROM bounds, sales s
         LEFT JOIN sale_lines sl ON sl.sale_id = s.id AND sl.deleted_at IS NULL
         WHERE s.tenant_id = $1::uuid
           AND s.deleted_at IS NULL
           AND s.payment_status IN ('paid', 'payment_pending')
           AND s.occurred_at >= bounds.week_start
           AND s.occurred_at <  bounds.now_ts
         UNION ALL
         SELECT 'prev_week'::text AS bucket,
                COALESCE(SUM(s.total_cents) FILTER (WHERE s.currency_code = $2), 0)::bigint AS revenue_cents,
                COUNT(DISTINCT s.id)::bigint AS transactions,
                COALESCE(SUM(sl.qty), 0)::bigint AS items_sold,
                (COALESCE(SUM(s.total_cents) FILTER (WHERE s.currency_code = $2), 0)
                  - COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty)
                       FILTER (WHERE s.currency_code = $2), 0))::bigint AS gross_profit_cents
         FROM bounds, sales s
         LEFT JOIN sale_lines sl ON sl.sale_id = s.id AND sl.deleted_at IS NULL
         WHERE s.tenant_id = $1::uuid
           AND s.deleted_at IS NULL
           AND s.payment_status IN ('paid', 'payment_pending')
           AND s.occurred_at >= bounds.prev_week_start
           AND s.occurred_at <  bounds.week_start`,
        tenantId,
        currency,
      ),

      client.$queryRawUnsafe<Revenue30Row[]>(
        `WITH days AS (
            SELECT generate_series(now()::date - 29, now()::date, interval '1 day')::date AS d
         )
         SELECT days.d AS date,
                COALESCE(SUM(s.total_cents), 0)::bigint AS cents
         FROM days
         LEFT JOIN sales s
           ON s.tenant_id = $1::uuid
          AND s.deleted_at IS NULL
          AND s.payment_status IN ('paid', 'payment_pending')
          AND s.currency_code = $2
          AND s.occurred_at::date = days.d
         GROUP BY days.d
         ORDER BY days.d ASC`,
        tenantId,
        currency,
      ),

      client.$queryRawUnsafe<SparklineRow[]>(
        `WITH days AS (
            SELECT generate_series(now()::date - 6, now()::date, interval '1 day')::date AS d
         )
         SELECT days.d AS date,
                COALESCE(SUM(s.total_cents) FILTER (WHERE s.currency_code = $2), 0)::bigint AS revenue_cents,
                COUNT(DISTINCT s.id)::bigint AS transactions,
                (COALESCE(SUM(s.total_cents) FILTER (WHERE s.currency_code = $2), 0)
                  - COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty)
                       FILTER (WHERE s.currency_code = $2), 0))::bigint AS gross_profit_cents
         FROM days
         LEFT JOIN sales s
           ON s.tenant_id = $1::uuid
          AND s.deleted_at IS NULL
          AND s.payment_status IN ('paid', 'payment_pending')
          AND s.occurred_at::date = days.d
         LEFT JOIN sale_lines sl
           ON sl.sale_id = s.id AND sl.deleted_at IS NULL
         GROUP BY days.d
         ORDER BY days.d ASC`,
        tenantId,
        currency,
      ),

      client.$queryRawUnsafe<LeaderboardRow[]>(
        `SELECT b.id AS branch_id,
                b.code,
                b.name_i18n,
                COALESCE(curr.revenue_cents, 0)::bigint AS revenue_cents,
                COALESCE(curr.transactions, 0)::bigint AS transactions,
                COALESCE(prev.revenue_cents, 0)::bigint AS prev_revenue_cents
         FROM branches b
         LEFT JOIN (
           SELECT s.branch_id,
                  SUM(s.total_cents) AS revenue_cents,
                  COUNT(DISTINCT s.id) AS transactions
           FROM sales s
           WHERE s.tenant_id = $1::uuid
             AND s.deleted_at IS NULL
             AND s.payment_status IN ('paid', 'payment_pending')
             AND s.currency_code = $2
             AND s.occurred_at >= now() - interval '7 days'
             AND s.occurred_at <  now()
           GROUP BY s.branch_id
         ) curr ON curr.branch_id = b.id
         LEFT JOIN (
           SELECT s.branch_id,
                  SUM(s.total_cents) AS revenue_cents
           FROM sales s
           WHERE s.tenant_id = $1::uuid
             AND s.deleted_at IS NULL
             AND s.payment_status IN ('paid', 'payment_pending')
             AND s.currency_code = $2
             AND s.occurred_at >= now() - interval '14 days'
             AND s.occurred_at <  now() - interval '7 days'
           GROUP BY s.branch_id
         ) prev ON prev.branch_id = b.id
         WHERE b.tenant_id = $1::uuid
           AND b.deleted_at IS NULL
           AND b.is_active = true
         ORDER BY revenue_cents DESC, b.code ASC`,
        tenantId,
        currency,
      ),

      client.$queryRawUnsafe<HeatmapRow[]>(
        `SELECT (EXTRACT(ISODOW FROM s.occurred_at)::int - 1) AS dow_idx,
                (EXTRACT(HOUR FROM s.occurred_at)::int - 8)   AS hour_idx,
                COALESCE(SUM(s.total_cents), 0)::bigint AS cents
         FROM sales s
         WHERE s.tenant_id = $1::uuid
           AND s.deleted_at IS NULL
           AND s.payment_status IN ('paid', 'payment_pending')
           AND s.currency_code = $2
           AND s.occurred_at >= now() - interval '28 days'
           AND s.occurred_at <  now()
           AND EXTRACT(HOUR FROM s.occurred_at) BETWEEN 8 AND 19
         GROUP BY 1, 2`,
        tenantId,
        currency,
      ),

      client.$queryRawUnsafe<RecentTxRow[]>(
        `SELECT s.id,
                s.code,
                s.branch_id,
                b.code AS branch_code,
                s.cashier_id,
                u.name AS cashier_name,
                COALESCE(line_counts.items, 0)::bigint AS items,
                s.total_cents,
                s.payment_method::text AS payment_method,
                s.payment_status,
                s.occurred_at
         FROM sales s
         LEFT JOIN branches b ON b.id = s.branch_id
         LEFT JOIN users u    ON u.id = s.cashier_id
         LEFT JOIN (
           SELECT sale_id, SUM(qty) AS items
           FROM sale_lines
           WHERE deleted_at IS NULL
           GROUP BY sale_id
         ) line_counts ON line_counts.sale_id = s.id
         WHERE s.tenant_id = $1::uuid
           AND s.deleted_at IS NULL
         ORDER BY s.occurred_at DESC
         LIMIT 7`,
        tenantId,
      ),

      client.$queryRawUnsafe<TopProductRow[]>(
        `SELECT sl.product_id,
                p.name_i18n,
                COALESCE(SUM(sl.line_total_cents), 0)::bigint AS revenue_cents
         FROM sale_lines sl
         INNER JOIN sales s   ON s.id = sl.sale_id
         INNER JOIN products p ON p.id = sl.product_id
         WHERE s.tenant_id = $1::uuid
           AND s.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND s.payment_status IN ('paid', 'payment_pending')
           AND s.currency_code = $2
           AND s.occurred_at >= now() - interval '7 days'
           AND s.occurred_at <  now()
         GROUP BY sl.product_id, p.name_i18n
         ORDER BY revenue_cents DESC
         LIMIT 1`,
        tenantId,
        currency,
      ),

      client.$queryRawUnsafe<CountRow[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM payment_proofs
         WHERE tenant_id = $1::uuid
           AND status = 'pending'
           AND deleted_at IS NULL
           AND created_at < now() - interval '48 hours'`,
        tenantId,
      ),

      client.$queryRawUnsafe<CountRow[]>(
        `SELECT COUNT(DISTINCT bs.product_id)::bigint AS c
         FROM branch_stock bs
         INNER JOIN branches b ON b.id = bs.branch_id
         WHERE bs.tenant_id = $1::uuid
           AND bs.deleted_at IS NULL
           AND b.deleted_at IS NULL
           AND b.is_active = true
           AND bs.qty_on_hand <= 0`,
        tenantId,
      ),

      client.$queryRawUnsafe<MixedCurrencyRow[]>(
        `SELECT EXISTS(
           SELECT 1 FROM sales s
           WHERE s.tenant_id = $1::uuid
             AND s.deleted_at IS NULL
             AND s.currency_code <> $2
         ) AS has_mixed`,
        tenantId,
        currency,
      ),
    ]);

    // ─── shape the response ────────────────────────────────────────────
    const thisWeek = weekMetrics.find((r) => r.bucket === "this_week");
    const prevWeek = weekMetrics.find((r) => r.bucket === "prev_week");

    const weekRevenue = toNumber(thisWeek?.revenue_cents);
    const weekTransactions = toNumber(thisWeek?.transactions);
    const weekItems = toNumber(thisWeek?.items_sold);
    const weekGross = toNumber(thisWeek?.gross_profit_cents);

    const prevRevenue = toNumber(prevWeek?.revenue_cents);
    const prevTransactions = toNumber(prevWeek?.transactions);
    const prevGross = toNumber(prevWeek?.gross_profit_cents);

    const avgBasketCents = weekTransactions > 0 ? Math.floor(weekRevenue / weekTransactions) : 0;

    // 30-day series — always 30 entries oldest-first.
    const revenue30dShaped = revenue30d.map((r) => ({
      date: toIsoDate(r.date),
      cents: toNumber(r.cents),
    }));

    // 7 sparklines, oldest-first.
    const sparkRev: number[] = [];
    const sparkTx: number[] = [];
    const sparkGp: number[] = [];
    for (const row of sparklines) {
      sparkRev.push(toNumber(row.revenue_cents));
      sparkTx.push(toNumber(row.transactions));
      sparkGp.push(toNumber(row.gross_profit_cents));
    }

    // Leaderboard with vs-prev-week pct.
    const leaderboardShaped: ApiOwnerDashboard["leaderboard"] = leaderboard.map((r) => {
      const curr = toNumber(r.revenue_cents);
      const prev = toNumber(r.prev_revenue_cents);
      const pct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
      return {
        branch_id: r.branch_id,
        code: r.code,
        name_i18n: (r.name_i18n as { en: string; ar: string } | null) ?? null,
        revenue_cents: curr.toString(),
        transactions: toNumber(r.transactions),
        vs_prev_week_pct: pct,
      };
    });

    // Heatmap — 7 rows × 12 columns. row 0 = Monday, col 0 = 08:00.
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0));
    let peak = 0;
    for (const row of heatmap) {
      if (row.dow_idx < 0 || row.dow_idx > 6) continue;
      if (row.hour_idx < 0 || row.hour_idx > 11) continue;
      const v = toNumber(row.cents);
      matrix[row.dow_idx]![row.hour_idx] = v;
      if (v > peak) peak = v;
    }
    const heatmapNormalized = matrix.map((row) =>
      row.map((v) => (peak > 0 ? Number((v / peak).toFixed(4)) : 0)),
    );

    // Recent transactions.
    const recentShaped: ApiOwnerDashboard["recent_transactions"] = recentTx.map((r) => ({
      id: r.id,
      code: r.code,
      branch_id: r.branch_id,
      branch_code: r.branch_code,
      cashier_id: r.cashier_id,
      cashier_name: r.cashier_name ?? "—",
      items: toNumber(r.items),
      total_cents: bigintToString(r.total_cents),
      payment_method: r.payment_method,
      payment_status: r.payment_status,
      occurred_at: r.occurred_at.toISOString(),
    }));

    // Top product (single row or null).
    const topProductShaped = topProduct[0]
      ? {
          product_id: topProduct[0].product_id,
          name_i18n: (topProduct[0].name_i18n as { en: string; ar: string } | null) ?? {
            en: "",
            ar: "",
          },
          revenue_cents: toNumber(topProduct[0].revenue_cents).toString(),
        }
      : null;

    const insightLeaderboard: InsightLeaderboardRow[] = leaderboardShaped.map((b) => ({
      branch_id: b.branch_id,
      code: b.code,
      name_i18n: b.name_i18n,
      revenue_cents: b.revenue_cents,
      transactions: b.transactions,
      vs_prev_week_pct: b.vs_prev_week_pct,
    }));

    const insights = computeInsights({
      tenantId,
      weekStart,
      leaderboard: insightLeaderboard,
      topProduct: topProductShaped,
      weekRevenueCents: weekRevenue.toString(),
      weekTransactions,
      stalePaymentProofsCount: toNumber(stalePaymentProofs[0]?.c),
      lowStockCount: toNumber(lowStockCount[0]?.c),
      currencyCode: currency,
    });

    return {
      currency_code: currency,
      mixed_currency_warning: mixedCurrency[0]?.has_mixed === true,
      generated_at: now.toISOString(),

      week: {
        revenue_cents: weekRevenue.toString(),
        transactions: weekTransactions,
        items_sold: weekItems,
        gross_profit_cents: weekGross.toString(),
        avg_basket_cents: avgBasketCents.toString(),
      },
      prev_week: {
        revenue_cents: prevRevenue.toString(),
        transactions: prevTransactions,
        gross_profit_cents: prevGross.toString(),
      },
      vs_prev_week: {
        revenue_pct: prevRevenue > 0 ? Math.round(((weekRevenue - prevRevenue) / prevRevenue) * 100) : null,
        transactions_pct:
          prevTransactions > 0
            ? Math.round(((weekTransactions - prevTransactions) / prevTransactions) * 100)
            : null,
        gross_profit_pct:
          prevGross > 0 ? Math.round(((weekGross - prevGross) / prevGross) * 100) : null,
      },

      revenue_30d: revenue30dShaped,
      sparklines: {
        revenue_cents: sparkRev,
        transactions: sparkTx,
        gross_profit_cents: sparkGp,
      },
      leaderboard: leaderboardShaped,
      heatmap: heatmapNormalized,
      recent_transactions: recentShaped,
      insights,
    };
  }
}

function toNumber(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

function bigintToString(v: bigint | number | null | undefined): string {
  if (v == null) return "0";
  return typeof v === "bigint" ? v.toString() : String(v);
}

function toIsoDate(d: Date): string {
  // Use UTC YYYY-MM-DD — generate_series returns timestamptz at midnight UTC
  // for ::date casts; we want the date as the server saw it.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
