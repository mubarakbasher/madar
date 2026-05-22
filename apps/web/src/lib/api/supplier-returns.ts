"use client";
import { apiFetch } from "./client";

export type SupplierReturnStatus = "draft" | "sent" | "refunded" | "cancelled";

// NOTE: `total_cents`, `unit_cost_cents`, `line_total_cents` are wire-
// serialized as decimal strings — same convention as purchase orders.

export interface ApiReturnLine {
  id: string;
  product_id: string;
  product_sku: string | null;
  product_name_i18n: { en: string; ar: string } | null;
  qty: number;
  unit_cost_cents: string;
  line_total_cents: string;
  reason_code: string | null;
}

export interface ApiReturnSummary {
  id: string;
  code: string;
  status: SupplierReturnStatus;
  currency_code: string;
  total_cents: string;
  reason: string;
  created_at: string;
  sent_at: string | null;
  refunded_at: string | null;
  cancelled_at: string | null;
  supplier: { id: string; code: string; name_i18n: { en: string; ar: string } | null };
  branch: { id: string; code: string | null; name_i18n: { en: string; ar: string } | null };
  line_count: number;
}

export interface ApiReturnDetail extends ApiReturnSummary {
  notes: string | null;
  lines: ApiReturnLine[];
}

export interface ReturnsListResponse {
  items: ApiReturnSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateReturnBody {
  supplier_id: string;
  branch_id: string;
  reason: string;
  notes?: string;
  lines: {
    product_id: string;
    qty: number;
    unit_cost_cents: number;
    reason_code?: string;
  }[];
}

export interface UpdateReturnBody {
  // PATCH mirrors POST — lines are replaced wholesale. PATCH is only valid
  // while status='draft'; the service enforces.
  supplier_id: string;
  branch_id: string;
  reason: string;
  notes?: string | null;
  lines: {
    product_id: string;
    qty: number;
    unit_cost_cents: number;
    reason_code?: string;
  }[];
}

export interface RefundReturnBody {
  notes?: string;
}

// ─── request functions ───────────────────────────────────────────────

export function supplierReturnsListRequest(
  opts: {
    status?: SupplierReturnStatus;
    supplier_id?: string;
    branch_id?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<ReturnsListResponse> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.supplier_id) q.set("supplier_id", opts.supplier_id);
  if (opts.branch_id) q.set("branch_id", opts.branch_id);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/supplier-returns${qs ? `?${qs}` : ""}`);
}

export function supplierReturnGetRequest(id: string): Promise<ApiReturnDetail> {
  return apiFetch(`/v1/supplier-returns/${id}`);
}

export function supplierReturnCreateRequest(
  body: CreateReturnBody,
): Promise<ApiReturnDetail> {
  return apiFetch(`/v1/supplier-returns`, { method: "POST", body });
}

export function supplierReturnUpdateRequest(
  id: string,
  body: UpdateReturnBody,
): Promise<ApiReturnDetail> {
  return apiFetch(`/v1/supplier-returns/${id}`, { method: "PATCH", body });
}

export function supplierReturnSendRequest(id: string): Promise<ApiReturnDetail> {
  return apiFetch(`/v1/supplier-returns/${id}/send`, { method: "POST" });
}

export function supplierReturnRefundRequest(
  id: string,
  body: RefundReturnBody = {},
): Promise<ApiReturnDetail> {
  return apiFetch(`/v1/supplier-returns/${id}/refund`, { method: "POST", body });
}

export function supplierReturnCancelRequest(id: string): Promise<ApiReturnDetail> {
  return apiFetch(`/v1/supplier-returns/${id}/cancel`, { method: "POST" });
}

export function supplierReturnDeleteRequest(
  id: string,
): Promise<{ id: string; deleted_at: string }> {
  return apiFetch(`/v1/supplier-returns/${id}`, { method: "DELETE" });
}
