"use client";
import { apiFetch } from "./client";

export interface CreateSaleLineInput {
  product_id: string;
  qty: number;
  line_discount_cents: number;
  note: string | null;
}

export type PaymentMethodId = "cash" | "card" | "bank_transfer" | "store_credit";

export interface SalePaymentInput {
  method: PaymentMethodId;
  amount_cents: string | number;
  approval_code?: string;
  cash_tendered_cents?: string | number;
}

export interface CreateSaleInput {
  branch_id: string;
  customer_id: string | null;
  currency_code: string;
  // Legacy single-method shape — kept for backward compat with 1.10a/b clients.
  payment_method?: PaymentMethodId;
  approval_code?: string;
  cash_tendered_cents?: number | null;
  // New shape: when present, server uses this for everything; the legacy
  // single-method fields above are ignored.
  payments?: SalePaymentInput[];
  client_uuid: string;
  client_sequence: number | null;
  // Offline-POS fields (Phase 2.3) — when the cashier rings a sale while
  // offline, the device captures the wall-clock time; the server clamps to
  // now() if it's in the future. `offline_completed=true` opts the sale into
  // the negative-stock conflict surfacing path.
  client_occurred_at?: string;
  offline_completed?: boolean;
  lines: CreateSaleLineInput[];
}

export interface SaleLineResponse {
  id: string;
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  qty: number;
  unit_price_cents: string;
  discount_cents: string;
  tax_cents: string;
  line_total_cents: string;
  cogs_snapshot_cents: string;
  note: string | null;
}

export interface SalePaymentResponse {
  id: string;
  method: PaymentMethodId;
  amount_cents: string;
  approval_code_last4: string | null;
  cash_tendered_cents: string | null;
  change_due_cents: string | null;
  store_credit_ledger_id: string | null;
}

export interface SaleResponse {
  id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  occurred_at: string;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  cash_tendered_cents: string | null;
  change_due_cents: string | null;
  currency_code: string;
  payment_method: PaymentMethodId | "split";
  payment_status: "paid" | "payment_pending" | "disputed" | "refunded";
  approval_code: string | null;
  client_uuid: string;
  client_occurred_at: string | null;
  has_negative_stock: boolean;
  offline_completed: boolean;
  lines: SaleLineResponse[];
  payments: SalePaymentResponse[];
}

export function createSale(input: CreateSaleInput): Promise<SaleResponse> {
  return apiFetch<SaleResponse>("/v1/sales", {
    method: "POST",
    body: input,
  });
}

export interface ReceiptResponse {
  sale: SaleResponse;
  tenant: {
    id: string;
    name: string;
    name_i18n: { en: string; ar: string };
    logo_url: string | null;
    legal_name: string | null;
    tax_registration_number: string | null;
  };
  branch: {
    code: string;
    name_i18n: { en: string; ar: string };
    address_i18n: { en?: string; ar?: string } | null;
  } | null;
  cashier: { name: string } | null;
  bank_account: {
    bank_name: string;
    account_holder: string;
    account_number_last4: string;
    iban_last4: string | null;
    swift: string | null;
  } | null;
}

export function receiptDataRequest(saleId: string): Promise<ReceiptResponse> {
  return apiFetch<ReceiptResponse>(`/v1/sales/${saleId}/receipt-data`);
}

export interface SaleSummary {
  id: string;
  code: string;
  branch_id: string;
  branch_code: string;
  cashier_id: string;
  cashier_name: string | null;
  customer_id: string | null;
  occurred_at: string;
  subtotal_cents: string;
  tax_cents: string;
  total_cents: string;
  refunded_amount_cents: string;
  currency_code: string;
  payment_method: PaymentMethodId | "split";
  payment_status: "paid" | "payment_pending" | "disputed" | "refunded";
  line_count: number;
}

export interface SalesListResponse {
  items: SaleSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface SalesListQuery {
  branch_id?: string;
  customer_id?: string;
  payment_method?: PaymentMethodId | "split";
  payment_status?: "paid" | "payment_pending" | "disputed" | "refunded";
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function salesListRequest(q: SalesListQuery = {}): Promise<SalesListResponse> {
  const p = new URLSearchParams();
  if (q.branch_id) p.set("branch_id", q.branch_id);
  if (q.customer_id) p.set("customer_id", q.customer_id);
  if (q.payment_method) p.set("payment_method", q.payment_method);
  if (q.payment_status) p.set("payment_status", q.payment_status);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.page) p.set("page", String(q.page));
  if (q.limit) p.set("limit", String(q.limit));
  const qs = p.toString();
  return apiFetch<SalesListResponse>(`/v1/sales${qs ? `?${qs}` : ""}`);
}
