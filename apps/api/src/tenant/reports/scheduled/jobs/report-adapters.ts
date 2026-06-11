/**
 * Producer adapters — bridge each report slice's existing service to the
 * uniform `ReportProducer.run(tenantId, params)` shape the scheduler expects.
 *
 * Why adapters live in this slice (not the others): the scheduler is the
 * consumer; coupling each report slice to the scheduler's interface would
 * invert the dependency arrow. Adapters are tiny — they just translate the
 * saved `params` JSON into the slice's existing query DTO and the slice's
 * response into a `rows: string[][]` table.
 */
import { Injectable } from "@nestjs/common";
import { currencyMinorUnits } from "../../../../common/currency";
import { PnlService } from "../../pnl/pnl.service";
import { TaxReportService } from "../../tax/tax.service";
import { TrendsService } from "../../trends/trends.service";
import type { ReportProducer, ReportRunResult } from "./report-runner";

// ─── helpers ─────────────────────────────────────────────────────────

function pickStr(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

function pickOptStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtCentsAsMajor(cents: string | number | bigint, currency: string): string {
  const n = typeof cents === "string" ? Number(cents) : Number(cents);
  if (!Number.isFinite(n)) return "—";
  const digits = currencyMinorUnits(currency);
  return `${currency} ${(n / 10 ** digits).toFixed(digits)}`;
}

// ─── PNL ────────────────────────────────────────────────────────────

@Injectable()
export class PnlProducer implements ReportProducer {
  constructor(private readonly pnl: PnlService) {}

  async run(tenantId: string, params: Record<string, unknown>): Promise<ReportRunResult> {
    // Default: last 30 days.
    const currency = pickStr(params, "currency", "USD").toUpperCase();
    const from = pickStr(params, "from", isoDaysAgo(30));
    const to = pickStr(params, "to", isoToday());
    const branchId = pickOptStr(params, "branch_id");

    const report = await this.pnl.generate(tenantId, {
      currency,
      from,
      to,
      ...(branchId ? { branch_id: branchId } : {}),
      group_by: "period",
      format: "json",
    } as unknown as Parameters<PnlService["generate"]>[1]);

    const rows: string[][] = [
      ["Metric", "Value"],
      ["Currency", report.currency],
      ["Period", `${report.from} → ${report.to}`],
      ["Revenue", fmtCentsAsMajor(report.revenue_cents, report.currency)],
      ["Discount", fmtCentsAsMajor(report.discount_cents, report.currency)],
      ["Tax", fmtCentsAsMajor(report.tax_cents, report.currency)],
      ["COGS", fmtCentsAsMajor(report.cogs_cents, report.currency)],
      ["Gross profit", fmtCentsAsMajor(report.gross_profit_cents, report.currency)],
      ["Gross profit %", `${report.gross_profit_pct.toFixed(2)}%`],
      ["Refunds", fmtCentsAsMajor(report.refunds_cents, report.currency)],
      ["Net revenue", fmtCentsAsMajor(report.net_revenue_cents, report.currency)],
      ["Transactions", String(report.transactions)],
    ];

    return {
      title: "P&L",
      periodLabel: report.period_label ?? `${report.from} → ${report.to}`,
      rows,
    };
  }
}

// ─── Tax ────────────────────────────────────────────────────────────

@Injectable()
export class TaxProducer implements ReportProducer {
  constructor(private readonly tax: TaxReportService) {}

  async run(tenantId: string, params: Record<string, unknown>): Promise<ReportRunResult> {
    const currency = pickStr(params, "currency", "USD").toUpperCase();
    const from = pickStr(params, "from", isoDaysAgo(30));
    const to = pickStr(params, "to", isoToday());
    const branchId = pickOptStr(params, "branch_id");

    const report = await this.tax.getReport(tenantId, {
      currency,
      from,
      to,
      ...(branchId ? { branch_id: branchId } : {}),
      format: "json",
    } as unknown as Parameters<TaxReportService["getReport"]>[1]);

    const rows: string[][] = [
      ["Tax class", "Code", "Rate", "Taxable sales", "Tax collected", "Transactions"],
    ];
    for (const item of report.items) {
      const name =
        item.tax_class_name_i18n?.en ?? item.tax_class_code ?? "Untaxed";
      rows.push([
        name,
        item.tax_class_code ?? "—",
        `${(item.rate_bps / 100).toFixed(2)}%`,
        fmtCentsAsMajor(item.taxable_sales_cents, currency),
        fmtCentsAsMajor(item.tax_collected_cents, currency),
        String(item.transactions),
      ]);
    }
    rows.push([
      "TOTAL",
      "",
      "",
      fmtCentsAsMajor(report.totals.taxable_sales_cents, currency),
      fmtCentsAsMajor(report.totals.tax_collected_cents, currency),
      String(report.totals.transactions),
    ]);

    return {
      title: "Tax",
      periodLabel: `${report.from} → ${report.to}`,
      rows,
    };
  }
}

// ─── Trends ─────────────────────────────────────────────────────────

@Injectable()
export class TrendsProducer implements ReportProducer {
  constructor(private readonly trends: TrendsService) {}

  async run(tenantId: string, params: Record<string, unknown>): Promise<ReportRunResult> {
    const currency = pickStr(params, "currency", "USD").toUpperCase();
    const metricRaw = pickStr(params, "metric", "revenue");
    const metric = (
      metricRaw === "transactions" || metricRaw === "gross_profit" ? metricRaw : "revenue"
    ) as "revenue" | "transactions" | "gross_profit";
    const windowRaw = Number(params.window);
    const window = (windowRaw === 7 || windowRaw === 90 ? windowRaw : 30) as 7 | 30 | 90;
    const branchId = pickOptStr(params, "branch_id");

    const report = await this.trends.getTrends(tenantId, {
      currency,
      metric,
      window,
      compare: "none",
      ...(branchId ? { branch_id: branchId } : {}),
    } as unknown as Parameters<TrendsService["getTrends"]>[1]);

    const valueLabel = metric === "transactions" ? "Count" : `Value (${currency})`;
    const rows: string[][] = [
      ["Date", valueLabel, "Rolling avg"],
    ];
    for (const p of report.series) {
      // Cents-based metrics display as major-unit numbers; transactions stay raw.
      const v =
        metric === "transactions" ? String(p.value) : (p.value / 100).toFixed(2);
      const ra =
        metric === "transactions"
          ? p.rolling_avg.toFixed(2)
          : (p.rolling_avg / 100).toFixed(2);
      rows.push([p.date, v, ra]);
    }

    return {
      title: `Trends — ${metric}`,
      periodLabel: `Last ${window} days`,
      rows,
    };
  }
}
