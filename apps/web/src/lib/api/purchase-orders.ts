"use client";
import { apiFetch } from "./client";

// Mirror the API_URL constant from client.ts so `purchaseOrderPdfUrl` can
// produce an absolute URL suitable for an `<a href>`.
const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export type PurchaseOrderStatus = "draft" | "ordered" | "received" | "cancelled";

// NOTE: Money columns (`subtotal_cents`, `tax_cents`, `shipping_cents`,
// `total_cents`, `unit_cost_cents`, `line_total_cents`) are wire-serialized
// as decimal strings — they are `bigint` in PostgreSQL and the service
// stringifies for transport safety. UI should parse with `Number(...)` where
// math is needed (values are bounded well within `Number.MAX_SAFE_INTEGER`).

export interface ApiPOLine {
  id: string;
  product_id: string;
  product_sku: string | null;
  product_name_i18n: { en: string; ar: string } | null;
  qty_ordered: number;
  qty_received: number | null;
  unit_cost_cents: string;
  line_total_cents: string;
  discrepancy_note: string | null;
}

export interface ApiPOSummary {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  currency_code: string;
  /** ISO date `YYYY-MM-DD`, or null. */
  expected_at: string | null;
  subtotal_cents: string;
  tax_cents: string;
  shipping_cents: string;
  total_cents: string;
  created_at: string;
  ordered_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  supplier: { id: string; code: string; name_i18n: { en: string; ar: string } | null };
  branch: { id: string; code: string | null; name_i18n: { en: string; ar: string } | null };
  line_count: number;
  has_discrepancy: boolean;
}

export interface ApiPODetail extends Omit<ApiPOSummary, "supplier"> {
  notes: string | null;
  supplier: {
    id: string;
    code: string;
    name_i18n: { en: string; ar: string } | null;
    contact_email: string | null;
  };
  lines: ApiPOLine[];
}

export interface POsListResponse {
  items: ApiPOSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface CreatePOBody {
  supplier_id: string;
  branch_id: string;
  /** ISO date `YYYY-MM-DD`. */
  expected_at?: string;
  notes?: string;
  tax_cents?: number;
  shipping_cents?: number;
  lines: { product_id: string; qty_ordered: number; unit_cost_cents?: number }[];
}

export interface UpdatePOBody {
  // PATCH mirrors POST — lines are replaced wholesale. `code` is never
  // client-editable.
  supplier_id: string;
  branch_id: string;
  /** ISO date `YYYY-MM-DD`, or null to clear. */
  expected_at?: string | null;
  notes?: string | null;
  tax_cents?: number;
  shipping_cents?: number;
  lines: { product_id: string; qty_ordered: number; unit_cost_cents?: number }[];
}

export interface OrderPOBody {
  send_email?: boolean;
}

export interface ReceivePOBody {
  lines: {
    line_id: string;
    qty_received: number;
    discrepancy_note?: string | null;
  }[];
}

// ─── request functions ───────────────────────────────────────────────

export function purchaseOrdersListRequest(
  opts: {
    status?: PurchaseOrderStatus;
    supplier_id?: string;
    branch_id?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<POsListResponse> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.supplier_id) q.set("supplier_id", opts.supplier_id);
  if (opts.branch_id) q.set("branch_id", opts.branch_id);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/purchase-orders${qs ? `?${qs}` : ""}`);
}

export function purchaseOrderGetRequest(id: string): Promise<ApiPODetail> {
  return apiFetch(`/v1/purchase-orders/${id}`);
}

export function purchaseOrderCreateRequest(body: CreatePOBody): Promise<ApiPODetail> {
  return apiFetch(`/v1/purchase-orders`, { method: "POST", body });
}

export function purchaseOrderUpdateRequest(
  id: string,
  body: UpdatePOBody,
): Promise<ApiPODetail> {
  return apiFetch(`/v1/purchase-orders/${id}`, { method: "PATCH", body });
}

export function purchaseOrderOrderRequest(
  id: string,
  body: OrderPOBody = {},
): Promise<ApiPODetail> {
  return apiFetch(`/v1/purchase-orders/${id}/order`, { method: "POST", body });
}

export function purchaseOrderReceiveRequest(
  id: string,
  body: ReceivePOBody,
): Promise<ApiPODetail> {
  return apiFetch(`/v1/purchase-orders/${id}/receive`, { method: "POST", body });
}

export function purchaseOrderCancelRequest(id: string): Promise<ApiPODetail> {
  return apiFetch(`/v1/purchase-orders/${id}/cancel`, { method: "POST" });
}

export function purchaseOrderDeleteRequest(
  id: string,
): Promise<{ id: string; deleted_at: string }> {
  return apiFetch(`/v1/purchase-orders/${id}`, { method: "DELETE" });
}

/**
 * Absolute URL for the controller-streamed PO PDF. Suitable for use as an
 * `<a href>` — the endpoint streams `application/pdf` with
 * `Content-Disposition: attachment; filename="<code>.pdf"`.
 */
export function purchaseOrderPdfUrl(id: string): string {
  return `${API_URL}/v1/purchase-orders/${id}/pdf`;
}
