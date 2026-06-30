"use client";
import { apiFetch } from "./client";

// ─── fixed-asset CRUD ─────────────────────────────────────────────────

export interface I18nText {
  en: string;
  ar: string;
}

export interface ApiFixedAsset {
  id: string;
  branch_id: string;
  branch_name_i18n: I18nText | null;
  name_i18n: I18nText;
  quantity: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetsListResponse {
  items: ApiFixedAsset[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateAssetBody {
  branch_id: string;
  name_i18n: I18nText;
  quantity: number;
  notes?: string | null;
}

export interface UpdateAssetBody {
  branch_id?: string;
  name_i18n?: I18nText;
  quantity?: number;
  notes?: string | null;
}

export function assetsListRequest(
  opts: { search?: string; branchId?: string; page?: number; limit?: number } = {},
): Promise<AssetsListResponse> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.branchId) q.set("branch_id", opts.branchId);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<AssetsListResponse>(`/v1/assets${qs ? `?${qs}` : ""}`);
}

export function assetGetRequest(id: string): Promise<ApiFixedAsset> {
  return apiFetch<ApiFixedAsset>(`/v1/assets/${id}`);
}

export function assetCreateRequest(body: CreateAssetBody): Promise<ApiFixedAsset> {
  return apiFetch<ApiFixedAsset>("/v1/assets", { method: "POST", body });
}

export function assetUpdateRequest(id: string, body: UpdateAssetBody): Promise<ApiFixedAsset> {
  return apiFetch<ApiFixedAsset>(`/v1/assets/${id}`, { method: "PATCH", body });
}

export function assetDeleteRequest(id: string): Promise<{ id: string; deleted: true }> {
  return apiFetch<{ id: string; deleted: true }>(`/v1/assets/${id}`, { method: "DELETE" });
}
