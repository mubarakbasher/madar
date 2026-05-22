"use client";
import { apiFetch } from "./client";

// Money on the wire is a string (BigInt cents). Number() at the formatting boundary only.

export interface ApiCashierShift {
  id: string;
  branch_id: string;
  branch_code: string;
  cashier_id: string;
  cashier_name: string | null;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  closed_by: string | null;
  opening_float_cents: string;
  declared_closing_cash_cents: string | null;
  expected_closing_cash_cents: string | null;
  variance_cents: string | null;
  currency_code: string;
  notes: string | null;
  status: "open" | "closed";
}

export interface ZReportPaymentBreakdown {
  method: string;
  count: number;
  amount_cents: string;
}

export interface ZReportTopProduct {
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  units: number;
  revenue_cents: string;
}

export interface ApiShiftDetail extends ApiCashierShift {
  z_report: {
    transactions: number;
    items_sold: number;
    gross_revenue_cents: string;
    cash_sales_cents: string;
    cash_refunds_cents: string;
    by_payment: ZReportPaymentBreakdown[];
    top_products: ZReportTopProduct[];
  };
}

export interface ShiftsListResponse {
  items: ApiCashierShift[];
  total: number;
  page: number;
  limit: number;
}

export interface OpenShiftBody {
  branch_id: string;
  opening_float_cents: number | string;
  currency_code?: string;
}

export interface CloseShiftBody {
  declared_closing_cash_cents: number | string;
  notes?: string | null;
}

export function shiftCurrentRequest(): Promise<ApiCashierShift | null> {
  return apiFetch<ApiCashierShift | null>(`/v1/shifts/current`);
}

export function shiftsListRequest(
  opts: { branch_id?: string; status?: "open" | "closed"; page?: number; limit?: number } = {},
): Promise<ShiftsListResponse> {
  const q = new URLSearchParams();
  if (opts.branch_id) q.set("branch_id", opts.branch_id);
  if (opts.status) q.set("status", opts.status);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<ShiftsListResponse>(`/v1/shifts${qs ? `?${qs}` : ""}`);
}

export function shiftGetRequest(id: string): Promise<ApiShiftDetail> {
  return apiFetch<ApiShiftDetail>(`/v1/shifts/${id}`);
}

export function shiftOpenRequest(body: OpenShiftBody): Promise<ApiCashierShift> {
  return apiFetch<ApiCashierShift>(`/v1/shifts/open`, { method: "POST", body });
}

export function shiftCloseRequest(id: string, body: CloseShiftBody): Promise<ApiShiftDetail> {
  return apiFetch<ApiShiftDetail>(`/v1/shifts/${id}/close`, { method: "POST", body });
}
