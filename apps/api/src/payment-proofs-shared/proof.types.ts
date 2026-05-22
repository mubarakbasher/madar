export type ProofContext = "sale" | "subscription";
export type ProofStatus = "pending" | "verified" | "rejected" | "cancelled";
export type BankAccountKind = "tenant" | "platform";

export interface ProofResponse {
  id: string;
  tenant_id: string;
  context: ProofContext;
  reference_id: string;
  amount_cents: string;
  currency_code: string;
  bank_account_kind: BankAccountKind;
  bank_account_id: string;
  payer_name: string;
  payer_bank: string | null;
  transfer_date: string;
  transfer_reference: string | null;
  receipt_url: string;
  status: ProofStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitProofInput {
  context: ProofContext;
  reference_id: string;
  amount_cents: bigint;
  currency_code: string;
  bank_account_kind: BankAccountKind;
  bank_account_id: string;
  payer_name: string;
  payer_bank?: string | null;
  transfer_date: string;
  transfer_reference: string;
}

export interface SubmitProofCtx {
  tenantId: string;
  userId: string;
  ip: string;
  userAgent: string;
  impersonatorId?: string;
}

export interface VerifierActor {
  realm: "tenant" | "admin";
  userId: string;
  tenantId: string | null;
  ip: string;
  userAgent: string;
  impersonatorId?: string;
}

export interface ListProofsQuery {
  context?: ProofContext;
  status?: ProofStatus;
  tenantId?: string;
  page: number;
  limit: number;
}

export interface ListProofsResponse {
  items: ProofResponse[];
  total: number;
  page: number;
  limit: number;
}
