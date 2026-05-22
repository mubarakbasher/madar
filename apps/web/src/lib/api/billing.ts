"use client";
import { apiFetch } from "./client";

export interface ApiPlan {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  monthly_price_cents: string;
  currency_code: string;
  limits: Record<string, unknown>;
  is_active: boolean;
}

export interface ApiPlatformBankAccount {
  id: string;
  name_i18n: { en: string; ar: string };
  bank_name: string;
  account_holder: string;
  account_number_last4: string;
  iban_last4: string | null;
  swift: string | null;
  currency_code: string;
  country_code: string;
  notes_i18n: { en?: string; ar?: string };
}

export interface ApiSubscriptionInvoice {
  id: string;
  reference_code: string;
  status: string;
  amount_cents: string;
  currency_code: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  plan: { code: string; name_i18n: { en: string; ar: string } };
}

export interface ApiSubscription {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    trial_ends_at: string | null;
    default_currency_code: string;
  };
  plan: ApiPlan;
  usage: {
    transactions_this_period: number;
    users: number;
    branches: number;
    storage_bytes: number;
  };
  next_invoice: ApiSubscriptionInvoice | null;
}

export function plansListRequest(): Promise<{ items: ApiPlan[]; total: number }> {
  return apiFetch<{ items: ApiPlan[]; total: number }>("/v1/plans");
}

export function subscriptionRequest(): Promise<ApiSubscription> {
  return apiFetch<ApiSubscription>("/v1/subscription");
}

export function invoicesListRequest(
  status?: string,
): Promise<{ items: ApiSubscriptionInvoice[]; total: number }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<{ items: ApiSubscriptionInvoice[]; total: number }>(
    `/v1/subscription-invoices${qs}`,
  );
}

export function invoiceGetRequest(
  id: string,
): Promise<
  ApiSubscriptionInvoice & {
    proofs: Array<{ id: string; status: string; created_at: string; transfer_reference: string | null }>;
  }
> {
  return apiFetch(`/v1/subscription-invoices/${id}`);
}

export function platformBankAccountsRequest(opts: {
  currency?: string;
  countryCode?: string;
}): Promise<{ items: ApiPlatformBankAccount[]; total: number }> {
  const q = new URLSearchParams();
  if (opts.currency) q.set("currency", opts.currency);
  if (opts.countryCode) q.set("country_code", opts.countryCode);
  const qs = q.toString();
  return apiFetch<{ items: ApiPlatformBankAccount[]; total: number }>(
    `/v1/platform-bank-accounts${qs ? `?${qs}` : ""}`,
  );
}

export function submitSubscriptionProof(
  invoiceId: string,
  body: {
    file: File;
    amount_cents: bigint | string;
    currency_code: string;
    bank_account_id: string;
    payer_name: string;
    payer_bank?: string | null;
    transfer_date: string;
    transfer_reference: string;
  },
): Promise<unknown> {
  const fd = new FormData();
  fd.set("context", "subscription");
  fd.set("reference_id", invoiceId);
  fd.set("amount_cents", String(body.amount_cents));
  fd.set("currency_code", body.currency_code);
  fd.set("bank_account_kind", "platform");
  fd.set("bank_account_id", body.bank_account_id);
  fd.set("payer_name", body.payer_name);
  if (body.payer_bank) fd.set("payer_bank", body.payer_bank);
  fd.set("transfer_date", body.transfer_date);
  fd.set("transfer_reference", body.transfer_reference);
  fd.set("receipt", body.file);
  return apiFetch("/v1/payment-proofs", { method: "POST", body: fd });
}
