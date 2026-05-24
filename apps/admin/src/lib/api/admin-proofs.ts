import { adminApiFetch, ApiError } from "./client";
import { useAdminAuthStore } from "../auth/store";

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
  previous_proof_id: string | null;
  info_requested_message: string | null;
  info_requested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListProofsResponse {
  items: ProofItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ListProofsQuery {
  context?: ProofContext;
  status?: ProofStatus;
  tenant_id?: string;
  page?: number;
  limit?: number;
}

export function adminListProofs(q: ListProofsQuery = {}): Promise<ListProofsResponse> {
  const params = new URLSearchParams();
  if (q.context) params.set("context", q.context);
  if (q.status) params.set("status", q.status);
  if (q.tenant_id) params.set("tenant_id", q.tenant_id);
  if (q.page) params.set("page", String(q.page));
  if (q.limit) params.set("limit", String(q.limit));
  const qs = params.toString();
  return adminApiFetch<ListProofsResponse>(`/v1/admin/payment-proofs${qs ? `?${qs}` : ""}`);
}

export function adminGetProof(id: string): Promise<ProofItem> {
  return adminApiFetch<ProofItem>(`/v1/admin/payment-proofs/${id}`);
}

export function adminApproveProof(id: string): Promise<ProofItem> {
  return adminApiFetch<ProofItem>(`/v1/admin/payment-proofs/${id}/verify`, { method: "POST" });
}

export function adminRequestProofInfo(
  id: string,
  message: string,
): Promise<ProofItem> {
  return adminApiFetch<ProofItem>(`/v1/admin/payment-proofs/${id}/request-info`, {
    method: "POST",
    body: { message },
  });
}

export function adminRejectProof(
  id: string,
  rejection_reason: string,
  notes?: string,
): Promise<ProofItem> {
  return adminApiFetch<ProofItem>(`/v1/admin/payment-proofs/${id}/reject`, {
    method: "POST",
    body: { rejection_reason, ...(notes ? { notes } : {}) },
  });
}

/**
 * Fetch a receipt as a Blob + create an object URL the client can pipe into an
 * <img> or <iframe>. Auth-token is attached from the Zustand store; if the
 * token is stale, the caller will see a 401 and should rely on `adminApiFetch`
 * (which they invoked earlier on the page) to have already refreshed it.
 *
 * Caller MUST call `URL.revokeObjectURL(url)` when the component unmounts to
 * avoid leaks.
 */
export async function adminFetchReceiptBlob(
  id: string,
): Promise<{ url: string; mime: string }> {
  const token = useAdminAuthStore.getState().accessToken;
  if (!token) {
    throw new ApiError(401, "admin_access_missing", "Admin session expired");
  }
  const res = await fetch(`${API_URL}/v1/admin/payment-proofs/${id}/receipt`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      "receipt_unavailable",
      `Receipt fetch failed (${res.status})`,
    );
  }
  const mime = res.headers.get("Content-Type") ?? "application/octet-stream";
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), mime };
}
