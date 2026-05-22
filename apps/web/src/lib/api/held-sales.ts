"use client";
import { apiFetch } from "./client";

export interface ApiHeldSaleSummary {
  id: string;
  name: string;
  note: string | null;
  branch_id: string;
  cashier_id: string;
  cashier_name: string;
  customer_id: string | null;
  customer_name: string | null;
  line_count: number;
  total_cents: string;
  currency_code: string;
  held_at: string;
}

export interface ApiHeldSaleLine {
  product_id: string;
  qty: number;
  unit_price_cents: string;
  discount_cents: string;
  note: string | null;
}

export interface ApiHeldSalePayload {
  id: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  name: string;
  note: string | null;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  currency_code: string;
  held_at: string;
  resumed_at: string | null;
  lines: ApiHeldSaleLine[];
}

export interface HeldSalesListResponse {
  items: ApiHeldSaleSummary[];
  total: number;
}

export interface CreateHeldSaleLineInput {
  product_id: string;
  qty: number;
  unit_price_cents: string;
  discount_cents?: string;
  note?: string | null;
}

export interface CreateHeldSaleInput {
  branch_id: string;
  name: string;
  note?: string | null;
  customer_id?: string | null;
  currency_code: string;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  lines: CreateHeldSaleLineInput[];
}

export function heldSalesListRequest(opts: {
  branchId: string;
  mineOnly?: boolean;
}): Promise<HeldSalesListResponse> {
  const q = new URLSearchParams({ branch_id: opts.branchId });
  q.set("mine_only", opts.mineOnly === false ? "false" : "true");
  return apiFetch<HeldSalesListResponse>(`/v1/held-sales?${q.toString()}`);
}

export function heldSaleCreateRequest(body: CreateHeldSaleInput): Promise<ApiHeldSalePayload> {
  return apiFetch<ApiHeldSalePayload>(`/v1/held-sales`, { method: "POST", body });
}

export function heldSaleResumeRequest(id: string): Promise<ApiHeldSalePayload> {
  return apiFetch<ApiHeldSalePayload>(`/v1/held-sales/${id}/resume`, { method: "POST" });
}

export function heldSaleDiscardRequest(
  id: string,
): Promise<{ id: string; discarded_at: string }> {
  return apiFetch<{ id: string; discarded_at: string }>(`/v1/held-sales/${id}`, {
    method: "DELETE",
  });
}
