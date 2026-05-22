"use client";
import { apiFetch } from "./client";

// ─── customer CRUD ────────────────────────────────────────────────────

export interface ApiCustomerSummary {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  store_credit_balance_minor: string;
  store_credit_currency_code: string | null;
  last_sale_at: string | null;
  sales_count: number;
  created_at: string;
}

export interface ApiCustomerSale {
  id: string;
  code: string;
  occurred_at: string;
  total_cents: string;
  currency_code: string;
  payment_status: string;
  branch_id: string;
}

export interface ApiCustomerDetail extends ApiCustomerSummary {
  notes: string | null;
  recent_sales: ApiCustomerSale[];
}

export interface CustomersListResponse {
  items: ApiCustomerSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateCustomerBody {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  code?: string | null;
}

export interface UpdateCustomerBody {
  name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  code?: string | null;
}

export function customersListRequest(
  opts: { search?: string; page?: number; limit?: number } = {},
): Promise<CustomersListResponse> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<CustomersListResponse>(`/v1/customers${qs ? `?${qs}` : ""}`);
}

export function customerGetRequest(id: string): Promise<ApiCustomerDetail> {
  return apiFetch<ApiCustomerDetail>(`/v1/customers/${id}`);
}

export function customerCreateRequest(body: CreateCustomerBody): Promise<ApiCustomerDetail> {
  return apiFetch<ApiCustomerDetail>("/v1/customers", { method: "POST", body });
}

export function customerUpdateRequest(
  id: string,
  body: UpdateCustomerBody,
): Promise<ApiCustomerDetail> {
  return apiFetch<ApiCustomerDetail>(`/v1/customers/${id}`, { method: "PATCH", body });
}

export function customerDeleteRequest(id: string): Promise<{ id: string; deleted: true }> {
  return apiFetch<{ id: string; deleted: true }>(`/v1/customers/${id}`, { method: "DELETE" });
}

// ─── shared types ─────────────────────────────────────────────────────

// NOTE: Money on the wire is a decimal string (BigInt cents). UI parses with
// Number(...) only at the formatting boundary.

export interface ApiStoreCreditLedgerEntry {
  id: string;
  amount_minor: string;
  balance_after_minor: string;
  reference_table: "sale" | "refund" | "manual_adjust" | "expiration" | "cancel";
  reference_id: string | null;
  note_i18n: { en?: string; ar?: string } | null;
  created_by: string | null;
  created_at: string;
}

export interface ApiStoreCreditSummary {
  customer_id: string;
  balance_minor: string;
  currency_code: string | null;
  ledger: ApiStoreCreditLedgerEntry[];
}

export interface AdjustStoreCreditBody {
  /** Signed integer string, in minor units (cents). E.g. "2500" or "-1000". */
  amount_minor: string;
  /** Required on the first credit; matched against the locked customer currency thereafter. */
  currency_code?: string;
  note_i18n: { en: string; ar: string };
}

// ─── request functions ───────────────────────────────────────────────

export function customerStoreCreditRequest(id: string): Promise<ApiStoreCreditSummary> {
  return apiFetch(`/v1/customers/${id}/store-credit`);
}

export function customerStoreCreditAdjustRequest(
  id: string,
  body: AdjustStoreCreditBody,
): Promise<ApiStoreCreditSummary> {
  return apiFetch(`/v1/customers/${id}/store-credit/adjust`, {
    method: "POST",
    body,
  });
}
