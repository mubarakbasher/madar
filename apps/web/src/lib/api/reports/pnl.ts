"use client";
import { apiFetch } from "../client";

const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

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

export interface PnlQueryOpts {
  currency: string;
  from: string;
  to: string;
  branch_id?: string;
  category_id?: string;
  group_by?: "period" | "branch" | "category" | "sku";
}

function buildQs(opts: PnlQueryOpts, format?: "json" | "csv"): string {
  const q = new URLSearchParams();
  q.set("currency", opts.currency);
  q.set("from", opts.from);
  q.set("to", opts.to);
  if (opts.branch_id) q.set("branch_id", opts.branch_id);
  if (opts.category_id) q.set("category_id", opts.category_id);
  if (opts.group_by) q.set("group_by", opts.group_by);
  if (format) q.set("format", format);
  return q.toString();
}

export function pnlReportRequest(opts: PnlQueryOpts): Promise<ApiPnlReport> {
  return apiFetch<ApiPnlReport>(`/v1/reports/pnl?${buildQs(opts)}`);
}

/**
 * Fetch the CSV export as a Blob and trigger a browser download. We don't
 * use apiFetch here because it assumes a JSON body — the file endpoint
 * needs raw response handling for the binary blob.
 */
export async function pnlReportCsvDownload(
  opts: PnlQueryOpts,
  accessToken: string | null,
): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/csv" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_URL}/v1/reports/pnl?${buildQs(opts, "csv")}`, {
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    throw new Error(`CSV download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pnl_${opts.from}_${opts.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
