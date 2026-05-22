"use client";
import { apiFetch } from "./client";

export interface ReconcileShift {
  id: string;
  cashier_id: string;
  cashier_name: string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  opening_float_cents: string;
  declared_closing_cash_cents: string | null;
  expected_closing_cash_cents: string | null;
  variance_cents: string | null;
}

export interface ReconcilePaymentRow {
  method: string;
  count: number;
  amount_cents: string;
}

export interface ReconcileTotals {
  gross_revenue_cents: string;
  transactions: number;
  items_sold: number;
  cash_sales_cents: string;
  cash_refunds_cents: string;
  opening_float_cents: string;
  expected_cash_cents: string;
  declared_cash_cents: string;
  variance_cents: string;
  by_payment: ReconcilePaymentRow[];
}

export interface ReconcileBranch {
  branch_id: string;
  branch_code: string;
  name_i18n: { en: string; ar: string };
  shifts: ReconcileShift[];
  totals: ReconcileTotals;
}

export interface ReconcileDayResponse {
  date: string;
  branches: ReconcileBranch[];
  chain_totals: ReconcileTotals;
}

export function reconcileDayRequest(opts: {
  date: string;
  branch_id?: string;
}): Promise<ReconcileDayResponse> {
  const q = new URLSearchParams({ date: opts.date });
  if (opts.branch_id) q.set("branch_id", opts.branch_id);
  return apiFetch<ReconcileDayResponse>(`/v1/reconcile/day?${q.toString()}`);
}
