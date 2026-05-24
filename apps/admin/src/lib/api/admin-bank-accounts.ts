import { adminApiFetch } from "./client";

export interface BankAccountResponse {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number_last4: string;
  iban_last4: string | null;
  swift: string | null;
  currency_code: string;
  country_code: string;
  name_i18n: { en: string };
  notes_i18n: { en: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBankAccountInput {
  bank_name: string;
  account_holder: string;
  account_number: string;
  iban?: string;
  swift?: string;
  currency_code: string;
  country_code: string;
  name_en?: string;
  notes_en?: string;
}

export type UpdateBankAccountInput = Partial<CreateBankAccountInput>;

export function adminListBankAccounts(includeInactive?: boolean): Promise<BankAccountResponse[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  return adminApiFetch<BankAccountResponse[]>(`/v1/admin/bank-accounts${qs}`);
}

export function adminGetBankAccount(id: string): Promise<BankAccountResponse> {
  return adminApiFetch<BankAccountResponse>(`/v1/admin/bank-accounts/${id}`);
}

export function adminCreateBankAccount(body: CreateBankAccountInput): Promise<BankAccountResponse> {
  return adminApiFetch<BankAccountResponse>("/v1/admin/bank-accounts", { method: "POST", body });
}

export function adminUpdateBankAccount(id: string, body: UpdateBankAccountInput): Promise<BankAccountResponse> {
  return adminApiFetch<BankAccountResponse>(`/v1/admin/bank-accounts/${id}`, { method: "PATCH", body });
}

export function adminSetBankAccountActive(id: string, active: boolean): Promise<BankAccountResponse> {
  return adminApiFetch<BankAccountResponse>(
    `/v1/admin/bank-accounts/${id}/${active ? "enable" : "disable"}`,
    { method: "POST" },
  );
}

export function adminRevealAccountNumber(id: string): Promise<{ account_number: string }> {
  return adminApiFetch<{ account_number: string }>(`/v1/admin/bank-accounts/${id}/reveal`, {
    method: "POST",
  });
}
