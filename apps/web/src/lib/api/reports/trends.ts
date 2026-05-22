"use client";
import { apiFetch } from "../client";

/**
 * Mirrors the server-side `ApiTrendsResponse` shape returned by
 * `GET /v1/reports/trends`. PAGES §41.
 */

export type TrendsMetric = "revenue" | "transactions" | "gross_profit";
export type TrendsWindow = 7 | 30 | 90;
export type TrendsCompare = "yoy" | "prev_period" | "none";

export interface ApiTrendsPoint {
  date: string; // ISO date (YYYY-MM-DD)
  value: number;
  value_prev: number | null;
  rolling_avg: number;
}

export interface ApiTrendsSummary {
  current_total: number;
  prev_total: number | null;
  delta_pct: number | null;
  peak: { date: string; value: number } | null;
  trough: { date: string; value: number } | null;
}

export interface ApiTrendsResponse {
  currency: string;
  window: TrendsWindow;
  metric: TrendsMetric;
  compare: TrendsCompare;
  series: ApiTrendsPoint[];
  summary: ApiTrendsSummary;
}

export interface TrendsRequestParams {
  currency: string;
  metric?: TrendsMetric;
  window?: TrendsWindow;
  compare?: TrendsCompare;
  branch_id?: string;
}

export function trendsRequest(params: TrendsRequestParams): Promise<ApiTrendsResponse> {
  const q = new URLSearchParams();
  q.set("currency", params.currency);
  if (params.metric) q.set("metric", params.metric);
  if (params.window) q.set("window", String(params.window));
  if (params.compare) q.set("compare", params.compare);
  if (params.branch_id) q.set("branch_id", params.branch_id);
  return apiFetch<ApiTrendsResponse>(`/v1/reports/trends?${q.toString()}`);
}
