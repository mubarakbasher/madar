"use client";
import { apiFetch } from "./client";

export interface ApiQuotationSummary {
  id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  customer_name: string | null;
  note: string | null;
  status: string;
  effective_status: string;
  total_cents: string;
  currency_code: string;
  valid_until: string;
  converted_sale_id: string | null;
  created_at: string;
}

export interface ApiQuotationLine {
  product_id: string;
  name_i18n: { en: string; ar: string };
  sku: string | null;
  qty: number;
  unit_price_cents: string;
  discount_cents: string;
  note: string | null;
}

export interface ApiQuotationPayload {
  id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  note: string | null;
  status: string;
  effective_status: string;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  currency_code: string;
  valid_until: string;
  converted_sale_id: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  lines: ApiQuotationLine[];
}

export interface QuotationsListResponse {
  items: ApiQuotationSummary[];
  total: number;
}

export interface CreateQuotationLineInput {
  product_id: string;
  qty: number;
  unit_price_cents: string;
  discount_cents?: string;
  note?: string | null;
}

export interface CreateQuotationInput {
  branch_id: string;
  note?: string | null;
  customer_id?: string | null;
  currency_code: string;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  valid_days: number;
  lines: CreateQuotationLineInput[];
}

export function quotationsListRequest(opts: {
  branchId: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<QuotationsListResponse> {
  const q = new URLSearchParams({ branch_id: opts.branchId });
  if (opts.status) q.set("status", opts.status);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  return apiFetch<QuotationsListResponse>(`/v1/quotations?${q.toString()}`);
}

export function quotationCreateRequest(body: CreateQuotationInput): Promise<ApiQuotationPayload> {
  return apiFetch<ApiQuotationPayload>(`/v1/quotations`, { method: "POST", body });
}

export function quotationDetailRequest(id: string): Promise<ApiQuotationPayload> {
  return apiFetch<ApiQuotationPayload>(`/v1/quotations/${id}`);
}

export function quotationCancelRequest(id: string): Promise<ApiQuotationPayload> {
  return apiFetch<ApiQuotationPayload>(`/v1/quotations/${id}/cancel`, { method: "POST" });
}
