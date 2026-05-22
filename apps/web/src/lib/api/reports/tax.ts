"use client";
import { apiFetch } from "../client";
import { useAuthStore } from "../../auth/store";

const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export interface ApiTaxReportItem {
  tax_class_id: string | null;
  tax_class_code: string | null;
  tax_class_name_i18n: { en: string; ar: string } | null;
  rate_bps: number;
  taxable_sales_cents: string;
  tax_collected_cents: string;
  transactions: number;
}

export interface ApiTaxReport {
  currency: string;
  from: string;
  to: string;
  tax_registration_number: string | null;
  items: ApiTaxReportItem[];
  totals: {
    taxable_sales_cents: string;
    tax_collected_cents: string;
    transactions: number;
  };
}

export interface TaxReportQuery {
  currency: string;
  from: string;
  to: string;
  branch_id?: string;
}

function toQs(q: TaxReportQuery, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  params.set("currency", q.currency);
  params.set("from", q.from);
  params.set("to", q.to);
  if (q.branch_id) params.set("branch_id", q.branch_id);
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  return params.toString();
}

export function taxReportRequest(q: TaxReportQuery): Promise<ApiTaxReport> {
  return apiFetch(`/v1/reports/tax?${toQs(q)}`);
}

/**
 * Fetch the binary PDF/CSV export and return a Blob. apiFetch can't be used
 * because it always JSON-parses; we replicate its bearer-token wiring inline.
 * The token (re-)freshness is handled by the in-memory auth store — callers
 * should download from a button click triggered after the report has been
 * fetched at least once (so the store is warm).
 */
export async function taxReportDownload(
  q: TaxReportQuery,
  format: "pdf" | "csv",
): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/v1/reports/tax?${toQs(q, { format })}`, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    throw new Error(`tax_report_download_failed_${res.status}`);
  }
  return res.blob();
}

/** Trigger a download by injecting a temporary <a> tag. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
