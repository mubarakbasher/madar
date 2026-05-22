import { ForbiddenException, Injectable } from "@nestjs/common";
// eslint-disable-next-line no-restricted-imports
import { tenantScoped } from "@madar/db";
import type { TrendsQuery } from "./dto/trends.dto";

/**
 * Trend analysis report — configurable rolling-window time series (7/30/90d)
 * with optional YoY or previous-period overlay. PAGES §41.
 *
 * Reader roles: owner, manager, accountant, auditor. Anything else → 403.
 *
 * Pattern lifted from DashboardService.getOwnerDashboard's 30-day series
 * (dashboard.service.ts:229-246) with the window length generalized and an
 * optional overlay query for `compare={yoy,prev_period}`.
 */

const READER_ROLES = new Set(["owner", "manager", "accountant", "auditor"]);

type Metric = "revenue" | "transactions" | "gross_profit";

interface SeriesRow {
  date: Date;
  value: bigint | number | null;
  rolling_avg: number | string | null;
}

interface OverlayRow {
  date: Date;
  value: bigint | number | null;
}

export interface ApiTrendsPoint {
  date: string;
  value: number;
  value_prev: number | null;
  rolling_avg: number;
}

export interface ApiTrendsResponse {
  currency: string;
  window: 7 | 30 | 90;
  metric: Metric;
  compare: "yoy" | "prev_period" | "none";
  series: ApiTrendsPoint[];
  summary: {
    current_total: number;
    prev_total: number | null;
    delta_pct: number | null;
    peak: { date: string; value: number } | null;
    trough: { date: string; value: number } | null;
  };
}

@Injectable()
export class TrendsService {
  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to view reports",
      });
    }
  }

  /**
   * SQL expression for the daily metric value. We aggregate at the day
   * granularity per the spec; revenue/gross_profit return cents (bigint),
   * transactions returns a count (bigint).
   *
   * NOTE: returned as bigint from PG; the JS layer coerces to number which is
   * safe for currency cents up to ~$90T and any realistic transaction count.
   */
  private valueExpr(metric: Metric): string {
    switch (metric) {
      case "transactions":
        return "COUNT(DISTINCT s.id)::bigint";
      case "gross_profit":
        return `(COALESCE(SUM(s.total_cents), 0)
           - COALESCE(SUM(COALESCE(sl.cogs_snapshot_cents, 0) * sl.qty), 0))::bigint`;
      case "revenue":
      default:
        return "COALESCE(SUM(s.total_cents), 0)::bigint";
    }
  }

  /**
   * Whether the query needs to join sale_lines. Gross profit needs the COGS
   * snapshot from each line; revenue + transactions only need the sale.
   */
  private needsLineJoin(metric: Metric): boolean {
    return metric === "gross_profit";
  }

  async getTrends(tenantId: string, q: TrendsQuery): Promise<ApiTrendsResponse> {
    const scoped = tenantScoped(tenantId);
    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...p: unknown[]) => Promise<T>;
    };

    const w = q.window;
    const metric = q.metric;
    const expr = this.valueExpr(metric);
    const lineJoin = this.needsLineJoin(metric)
      ? "LEFT JOIN sale_lines sl ON sl.sale_id = s.id AND sl.deleted_at IS NULL"
      : "";

    // Build optional branch filter as a separate predicate. We parameterize by
    // position: $1=tenantId, $2=currency, $3=branch_id (when present).
    const params: unknown[] = [tenantId, q.currency];
    let branchPredicate = "";
    if (q.branch_id) {
      params.push(q.branch_id);
      branchPredicate = `AND s.branch_id = $${params.length}::uuid`;
    }

    // Daily series + rolling average computed in a CTE. The rolling-avg window
    // looks back (window-1) rows plus the current row, so the value on day t
    // is the mean of values on [t-(w-1), t]. The first (w-1) rows have a
    // partial window — Postgres returns the partial mean which is the right
    // semantic (no pretending we have data we don't).
    const seriesSql = `
      WITH days AS (
        SELECT generate_series(now()::date - ${w - 1}, now()::date, interval '1 day')::date AS d
      ),
      daily AS (
        SELECT days.d AS date,
               ${expr} AS value
        FROM days
        LEFT JOIN sales s
          ON s.tenant_id = $1::uuid
         AND s.deleted_at IS NULL
         AND s.payment_status IN ('paid', 'payment_pending')
         AND s.currency_code = $2
         AND s.occurred_at::date = days.d
         ${branchPredicate}
        ${lineJoin}
        GROUP BY days.d
      )
      SELECT date,
             value,
             AVG(value) OVER (ORDER BY date ROWS BETWEEN ${w - 1} PRECEDING AND CURRENT ROW) AS rolling_avg
      FROM daily
      ORDER BY date ASC;
    `;

    const seriesRows = await client.$queryRawUnsafe<SeriesRow[]>(seriesSql, ...params);

    // Overlay series (compare=prev_period or yoy). For prev_period we shift
    // the window by `w` days (immediately preceding). For yoy we shift by 365
    // days. In both cases the overlay has the same row count as the main
    // series and we align by *index*, not date.
    let overlayRows: OverlayRow[] | null = null;
    if (q.compare !== "none") {
      const shiftDays = q.compare === "yoy" ? 365 : w;
      const overlaySql = `
        WITH days AS (
          SELECT generate_series(
                   now()::date - ${w - 1} - ${shiftDays},
                   now()::date - ${shiftDays},
                   interval '1 day'
                 )::date AS d
        )
        SELECT days.d AS date,
               ${expr} AS value
        FROM days
        LEFT JOIN sales s
          ON s.tenant_id = $1::uuid
         AND s.deleted_at IS NULL
         AND s.payment_status IN ('paid', 'payment_pending')
         AND s.currency_code = $2
         AND s.occurred_at::date = days.d
         ${branchPredicate}
        ${lineJoin}
        GROUP BY days.d
        ORDER BY days.d ASC;
      `;
      overlayRows = await client.$queryRawUnsafe<OverlayRow[]>(overlaySql, ...params);
    }

    // Stitch series + overlay together by index. Both queries use a
    // generate_series of length `w`, so this is safe.
    const series: ApiTrendsPoint[] = seriesRows.map((row, i) => {
      const value = toNumber(row.value);
      const rolling = row.rolling_avg !== null ? Number(row.rolling_avg) : value;
      const valuePrev = overlayRows ? toNumber(overlayRows[i]?.value ?? null) : null;
      return {
        date: row.date.toISOString().slice(0, 10),
        value,
        value_prev: overlayRows ? valuePrev : null,
        rolling_avg: Math.round(rolling),
      };
    });

    // Summary KPIs.
    const currentTotal = series.reduce((a, p) => a + p.value, 0);
    const prevTotal = overlayRows
      ? series.reduce((a, p) => a + (p.value_prev ?? 0), 0)
      : null;
    const deltaPct =
      prevTotal !== null && prevTotal > 0
        ? ((currentTotal - prevTotal) / prevTotal) * 100
        : null;

    // Peak / trough only meaningful when at least one day has activity.
    const nonEmpty = series.filter((p) => p.value !== 0);
    let peak: ApiTrendsResponse["summary"]["peak"] = null;
    let trough: ApiTrendsResponse["summary"]["trough"] = null;
    if (nonEmpty.length > 0) {
      const peakPt = nonEmpty.reduce((best, p) => (p.value > best.value ? p : best));
      const troughPt = nonEmpty.reduce((best, p) => (p.value < best.value ? p : best));
      peak = { date: peakPt.date, value: peakPt.value };
      trough = { date: troughPt.date, value: troughPt.value };
    }

    return {
      currency: q.currency,
      window: w as 7 | 30 | 90,
      metric,
      compare: q.compare,
      series,
      summary: {
        current_total: currentTotal,
        prev_total: prevTotal,
        delta_pct: deltaPct !== null ? Number(deltaPct.toFixed(2)) : null,
        peak,
        trough,
      },
    };
  }
}

function toNumber(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}
