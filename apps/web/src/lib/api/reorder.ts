"use client";
import { apiFetch } from "./client";

// Money columns (`unit_cost_cents`, `suggested_total_cents`) are wire-serialized
// as decimal strings — bigint in PostgreSQL. Parse with Number(...) for display.

export interface ApiReorderLine {
  product_id: string;
  sku: string;
  name_i18n: { en?: string; ar?: string } | null;
  qty_on_hand: number;
  days_of_cover: number | null;
  velocity_per_day: number;
  suggested_qty: number;
  unit_cost_cents: string;
}

export interface ApiReorderGroup {
  supplier_id: string;
  supplier_code: string;
  supplier_name_i18n: { en?: string; ar?: string } | null;
  lead_time_days: number | null;
  currency_code: string;
  lines: ApiReorderLine[];
  suggested_total_cents: string;
}

export interface ApiReorderSuggestions {
  branch_id: string;
  branch_code: string;
  branch_name_i18n: { en?: string; ar?: string } | null;
  horizon_days: number;
  at_risk_count: number;
  groups: ApiReorderGroup[];
  ungrouped: ApiReorderLine[];
}

export function reorderSuggestionsRequest(opts: {
  branch_id: string;
  horizon_days?: number;
}): Promise<ApiReorderSuggestions> {
  const p = new URLSearchParams();
  p.set("branch_id", opts.branch_id);
  if (opts.horizon_days) p.set("horizon_days", String(opts.horizon_days));
  return apiFetch<ApiReorderSuggestions>(`/v1/reorder/suggestions?${p.toString()}`);
}
