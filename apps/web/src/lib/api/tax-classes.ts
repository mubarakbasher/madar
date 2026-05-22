"use client";
import { apiFetch } from "./client";

export interface ApiTaxClass {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  rate_bps: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface TaxClassesListResponse {
  items: ApiTaxClass[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateTaxClassBody {
  code: string;
  name_i18n: { en: string; ar: string };
  rate_bps: number;
  is_active?: boolean;
}

export interface UpdateTaxClassBody {
  code?: string;
  name_i18n?: { en: string; ar: string };
  rate_bps?: number;
  is_active?: boolean;
}

export function taxClassesListRequest(
  opts: { search?: string; active_only?: boolean; page?: number; limit?: number } = {},
): Promise<TaxClassesListResponse> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.active_only !== undefined) q.set("active_only", String(opts.active_only));
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/tax-classes${qs ? `?${qs}` : ""}`);
}

export function taxClassGetRequest(id: string): Promise<ApiTaxClass> {
  return apiFetch(`/v1/tax-classes/${id}`);
}

export function taxClassCreateRequest(body: CreateTaxClassBody): Promise<ApiTaxClass> {
  return apiFetch(`/v1/tax-classes`, { method: "POST", body });
}

export function taxClassUpdateRequest(
  id: string,
  body: UpdateTaxClassBody,
): Promise<ApiTaxClass> {
  return apiFetch(`/v1/tax-classes/${id}`, { method: "PATCH", body });
}

export function taxClassSetDefaultRequest(id: string): Promise<ApiTaxClass> {
  return apiFetch(`/v1/tax-classes/${id}/set-default`, { method: "POST" });
}

export function taxClassDeleteRequest(
  id: string,
): Promise<{ id: string; deleted_at: string }> {
  return apiFetch(`/v1/tax-classes/${id}`, { method: "DELETE" });
}
