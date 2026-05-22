"use client";
import { apiFetch } from "./client";

export interface TenantBankAccount {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number_last4: string;
  iban_last4: string | null;
  swift: string | null;
  currency_code: string;
  branch_id: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface ListTenantBankAccountsResponse {
  items: TenantBankAccount[];
}

export function listTenantBankAccounts(
  opts: { branch_id?: string } = {},
): Promise<ListTenantBankAccountsResponse> {
  const qs = opts.branch_id ? `?branch_id=${encodeURIComponent(opts.branch_id)}` : "";
  return apiFetch<ListTenantBankAccountsResponse>(`/v1/tenant-bank-accounts${qs}`);
}
