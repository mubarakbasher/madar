"use client";
import { apiFetch } from "./client";

export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export interface ApiTransferLine {
  id: string;
  product_id: string;
  product_sku: string | null;
  product_name_i18n: { en: string; ar: string } | null;
  qty_sent: number;
  qty_received: number | null;
  discrepancy_note: string | null;
}

export interface ApiTransferSummary {
  id: string;
  code: string;
  from_branch_id: string;
  from_branch_code: string | null;
  from_branch_name_i18n: { en: string; ar: string } | null;
  to_branch_id: string;
  to_branch_code: string | null;
  to_branch_name_i18n: { en: string; ar: string } | null;
  status: TransferStatus;
  notes: string | null;
  line_count: number;
  total_qty_sent: number;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
}

export interface ApiTransferDetail extends ApiTransferSummary {
  lines: ApiTransferLine[];
  has_discrepancy: boolean;
}

export interface TransfersListResponse {
  items: ApiTransferSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateTransferBody {
  from_branch_id: string;
  to_branch_id: string;
  notes?: string;
  lines: { product_id: string; qty_sent: number }[];
}

export interface UpdateTransferBody {
  notes?: string | null;
  lines?: { product_id: string; qty_sent: number }[];
}

export interface ReceiveTransferBody {
  lines: { line_id: string; qty_received: number; discrepancy_note?: string | null }[];
}

export function transfersListRequest(opts: { status?: TransferStatus; page?: number; limit?: number } = {}): Promise<TransfersListResponse> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/stock-transfers${qs ? `?${qs}` : ""}`);
}

export function transferGetRequest(id: string): Promise<ApiTransferDetail> {
  return apiFetch(`/v1/stock-transfers/${id}`);
}

export function transferCreateRequest(body: CreateTransferBody): Promise<ApiTransferDetail> {
  return apiFetch(`/v1/stock-transfers`, { method: "POST", body });
}

export function transferUpdateRequest(id: string, body: UpdateTransferBody): Promise<ApiTransferDetail> {
  return apiFetch(`/v1/stock-transfers/${id}`, { method: "PATCH", body });
}

export function transferSendRequest(id: string): Promise<ApiTransferDetail> {
  return apiFetch(`/v1/stock-transfers/${id}/send`, { method: "POST" });
}

export function transferReceiveRequest(id: string, body: ReceiveTransferBody): Promise<ApiTransferDetail> {
  return apiFetch(`/v1/stock-transfers/${id}/receive`, { method: "POST", body });
}

export function transferCancelRequest(id: string): Promise<ApiTransferDetail> {
  return apiFetch(`/v1/stock-transfers/${id}/cancel`, { method: "POST" });
}

export function transferDeleteRequest(id: string): Promise<{ id: string; deleted_at: string }> {
  return apiFetch(`/v1/stock-transfers/${id}`, { method: "DELETE" });
}
