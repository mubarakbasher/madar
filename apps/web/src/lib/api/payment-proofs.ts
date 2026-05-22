"use client";
import { apiFetch, ApiError } from "./client";
import { useAuthStore } from "../auth/store";

const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export type ProofContext = "sale" | "subscription";
export type ProofStatus = "pending" | "verified" | "rejected" | "cancelled";
export type BankAccountKind = "tenant" | "platform";

export interface ProofItem {
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

export interface ListProofsResponse {
  items: ProofItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SubmitProofInput {
  context: ProofContext;
  reference_id: string;
  amount_cents: string;
  currency_code: string;
  bank_account_kind: BankAccountKind;
  bank_account_id: string;
  payer_name: string;
  transfer_date: string; // YYYY-MM-DD
  transfer_reference: string;
  receipt_file: File;
}

export async function submitPaymentProof(input: SubmitProofInput): Promise<ProofItem> {
  const fd = new FormData();
  fd.append("context", input.context);
  fd.append("reference_id", input.reference_id);
  fd.append("amount_cents", input.amount_cents);
  fd.append("currency_code", input.currency_code);
  fd.append("bank_account_kind", input.bank_account_kind);
  fd.append("bank_account_id", input.bank_account_id);
  fd.append("payer_name", input.payer_name);
  fd.append("transfer_date", input.transfer_date);
  fd.append("transfer_reference", input.transfer_reference);
  fd.append("receipt", input.receipt_file);
  return apiFetch<ProofItem>("/v1/payment-proofs", { method: "POST", body: fd });
}

export interface ListProofsQuery {
  context?: ProofContext;
  status?: ProofStatus;
  page?: number;
  limit?: number;
}

export function listPaymentProofs(q: ListProofsQuery = {}): Promise<ListProofsResponse> {
  const params = new URLSearchParams();
  if (q.context) params.set("context", q.context);
  if (q.status) params.set("status", q.status);
  if (q.page) params.set("page", String(q.page));
  if (q.limit) params.set("limit", String(q.limit));
  const qs = params.toString();
  return apiFetch<ListProofsResponse>(`/v1/payment-proofs${qs ? `?${qs}` : ""}`);
}

export function getPaymentProof(id: string): Promise<ProofItem> {
  return apiFetch<ProofItem>(`/v1/payment-proofs/${id}`);
}

export function approvePaymentProof(id: string): Promise<ProofItem> {
  return apiFetch<ProofItem>(`/v1/payment-proofs/${id}/verify`, { method: "POST" });
}

export function rejectPaymentProof(
  id: string,
  rejection_reason: string,
  notes?: string,
): Promise<ProofItem> {
  return apiFetch<ProofItem>(`/v1/payment-proofs/${id}/reject`, {
    method: "POST",
    body: { rejection_reason, ...(notes ? { notes } : {}) },
  });
}

/**
 * Receipt streaming endpoint returns binary — apiFetch parses JSON, so we do
 * a raw fetch with Bearer header and turn the bytes into a Blob URL. Caller
 * must call `URL.revokeObjectURL(url)` when done.
 */
export async function fetchPaymentProofReceiptBlob(
  id: string,
): Promise<{ url: string; mime: string }> {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    throw new ApiError(401, "access_missing", "Tenant session expired");
  }
  const res = await fetch(`${API_URL}/v1/payment-proofs/${id}/receipt`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError(res.status, "receipt_unavailable", `Receipt fetch failed (${res.status})`);
  }
  const mime = res.headers.get("Content-Type") ?? "application/octet-stream";
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), mime };
}
