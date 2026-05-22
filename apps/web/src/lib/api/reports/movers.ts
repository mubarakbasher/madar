"use client";
import { apiFetch } from "../client";

// Mirrors the server-side `ApiMoversResponse` shape returned by
// `GET /v1/reports/movers` (apps/api/src/tenant/reports/movers/movers.service.ts).

export interface ApiMoverItem {
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  category_id: string | null;
  category_name_i18n: { en: string; ar: string } | null;
  revenue_cents: string;
  units: number;
  cogs_cents: string;
  gross_profit_cents: string;
  /** Percentage with 2-decimal precision (e.g. 42.75). */
  gross_profit_pct: number;
  /** Length 7, oldest day first. Cents (number — fits within JS-safe int range for slice 1). */
  sparkline_7d: number[];
}

export type MoversMetric = "revenue" | "units" | "profit";

export interface ApiMoversResponse {
  currency: string;
  from: string;
  to: string;
  metric: MoversMetric;
  items: ApiMoverItem[];
  slow_movers: ApiMoverItem[];
}

export interface MoversParams {
  currency: string;
  from: string;
  to: string;
  branch_id?: string | null;
  category_id?: string | null;
  metric?: MoversMetric;
  limit?: number;
}

export function moversRequest(params: MoversParams): Promise<ApiMoversResponse> {
  const q = new URLSearchParams();
  q.set("currency", params.currency);
  q.set("from", params.from);
  q.set("to", params.to);
  if (params.branch_id) q.set("branch_id", params.branch_id);
  if (params.category_id) q.set("category_id", params.category_id);
  if (params.metric) q.set("metric", params.metric);
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiFetch<ApiMoversResponse>(`/v1/reports/movers?${q.toString()}`);
}
