"use client";
import { apiFetch } from "./client";

export type SyncConflictKind =
  | "negative_stock"
  | "duplicate_uuid"
  | "product_unknown"
  | "price_drift";

export type SyncConflictStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "ignored";

export interface ApiSyncConflict {
  id: string;
  conflict_kind: SyncConflictKind;
  reference_table: string;
  reference_id: string;
  details: unknown;
  resolution_status: SyncConflictStatus;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  occurred_at: string;
  created_at: string;
}

export interface SyncConflictsListResponse {
  items: ApiSyncConflict[];
  total: number;
  page: number;
  limit: number;
}

export interface SyncConflictsSummary {
  open: number;
  acknowledged: number;
  resolved: number;
  ignored: number;
  total: number;
}

export interface ResolveSyncConflictBody {
  resolution_status: "acknowledged" | "resolved" | "ignored";
  review_notes?: string | null;
}

export function syncConflictsListRequest(
  opts: {
    status?: SyncConflictStatus;
    conflict_kind?: SyncConflictKind;
    page?: number;
    limit?: number;
  } = {},
): Promise<SyncConflictsListResponse> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.conflict_kind) q.set("conflict_kind", opts.conflict_kind);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/sync-conflicts${qs ? `?${qs}` : ""}`);
}

export function syncConflictsSummaryRequest(): Promise<SyncConflictsSummary> {
  return apiFetch(`/v1/sync-conflicts/summary`);
}

export function syncConflictResolveRequest(
  id: string,
  body: ResolveSyncConflictBody,
): Promise<ApiSyncConflict> {
  return apiFetch(`/v1/sync-conflicts/${id}/resolve`, {
    method: "POST",
    body,
  });
}
