"use client";
import { apiFetch } from "./client";

export interface ApiSaleRefundLine {
  id: string;
  sale_line_id: string;
  qty: number;
  unit_price_snapshot_cents: string;
  tax_snapshot_cents: string;
  line_total_cents: string;
  restock: boolean;
}

export interface ApiSaleRefundPayment {
  id: string;
  method: string;
  amount_cents: string;
  approval_code: string | null;
  store_credit_ledger_id: string | null;
}

export interface ApiSaleRefund {
  id: string;
  sale_id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  shift_id: string | null;
  customer_id: string | null;
  currency_code: string;
  subtotal_cents: string;
  tax_cents: string;
  total_cents: string;
  notes: string | null;
  requires_manager: boolean;
  approved_by_user_id: string | null;
  status: "completed" | "voided";
  occurred_at: string;
  lines: ApiSaleRefundLine[];
  payments: ApiSaleRefundPayment[];
}

export interface CreateRefundLineInput {
  sale_line_id: string;
  qty: number;
  restock?: boolean;
}

export interface CreateRefundPaymentInput {
  method: "cash" | "card" | "bank_transfer" | "store_credit";
  amount_cents: number | string;
  approval_code?: string;
}

export interface CreateRefundBody {
  sale_id: string;
  lines: CreateRefundLineInput[];
  payments: CreateRefundPaymentInput[];
  notes?: string | null;
  customer_id?: string | null;
  approved_by_user_id?: string | null;
}

export interface SaleRefundsListResponse {
  items: ApiSaleRefund[];
  total: number;
  page: number;
  limit: number;
}

export function saleRefundsListRequest(
  opts: { sale_id?: string; branch_id?: string; page?: number; limit?: number } = {},
): Promise<SaleRefundsListResponse> {
  const q = new URLSearchParams();
  if (opts.sale_id) q.set("sale_id", opts.sale_id);
  if (opts.branch_id) q.set("branch_id", opts.branch_id);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<SaleRefundsListResponse>(`/v1/sale-refunds${qs ? `?${qs}` : ""}`);
}

export function saleRefundGetRequest(id: string): Promise<ApiSaleRefund> {
  return apiFetch<ApiSaleRefund>(`/v1/sale-refunds/${id}`);
}

export function saleRefundCreateRequest(body: CreateRefundBody): Promise<ApiSaleRefund> {
  return apiFetch<ApiSaleRefund>("/v1/sale-refunds", { method: "POST", body });
}
