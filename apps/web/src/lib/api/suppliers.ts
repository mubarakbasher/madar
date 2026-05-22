"use client";
import { apiFetch } from "./client";

// Mirror the API_URL constant from client.ts so URL-builder helpers (e.g.
// download links used as anchor `href` values) can produce absolute URLs
// without leaking the constant out of the client module. Same pattern as
// `catalog.ts` and `payment-proofs.ts`.
const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export type DocumentKind = "contract" | "tax_certificate" | "bank_letter" | "other";

// ─── shared types ─────────────────────────────────────────────────────

// NOTE: The backend serializes BigInt money columns as decimal strings
// (`owed_cents`, `total_spend_cents`, `unit_cost_cents`, `total_cents`, …).
// The UI parses them with Number(...) where it needs math; types stay
// faithful to the wire shape.

export interface ApiSupplierSummary {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  country_code: string | null;
  currency_code: string;
  lead_time_days: number | null;
  payment_terms: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  // computed
  open_pos_count: number;
  owed_cents: string;
  last_order_at: string | null;
}

export interface ApiSupplierStats {
  fill_rate_pct: number | null;
  on_time_pct: number | null;
  avg_lead_time_days: number | null;
  total_orders: number;
  total_spend_cents: string;
}

export interface ApiSupplierActivity {
  kind: "po" | "audit";
  id: string;
  occurred_at: string;
  // PO fields (kind='po')
  code?: string | null;
  status?: string | null;
  total_cents?: string | null;
  // Audit fields (kind='audit')
  action?: string | null;
  actor_id?: string | null;
}

export interface ApiSupplierDetail {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  country_code: string | null;
  currency_code: string;
  lead_time_days: number | null;
  payment_terms: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_i18n: { en?: string; ar?: string } | null;
  tax_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stats: ApiSupplierStats;
  recent_activity: ApiSupplierActivity[];
}

export interface ApiSupplierCatalogEntry {
  id: string;
  product_id: string;
  product_sku: string;
  product_name_i18n: { en: string; ar: string };
  supplier_sku: string | null;
  unit_cost_cents: string;
  currency_code: string;
  is_preferred: boolean;
  effective_from: string | null;
}

export interface ApiSupplierDocument {
  id: string;
  kind: DocumentKind;
  file_path: string;
  signed_url: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  // Controller-stream fallback that always works regardless of S3 signing.
  download_url: string;
}

// ─── list/get/CRUD bodies ────────────────────────────────────────────

export interface SuppliersListResponse {
  items: ApiSupplierSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateSupplierBody {
  code: string;
  name_i18n: { en: string; ar: string };
  country_code?: string;
  currency_code?: string;
  lead_time_days?: number;
  payment_terms?: string;
  contact_email?: string;
  contact_phone?: string;
  address_i18n?: { en?: string; ar?: string } | null;
  tax_id?: string;
  notes?: string;
  is_active?: boolean;
}

export interface UpdateSupplierBody {
  // `code` is immutable; not in the update schema.
  name_i18n?: { en: string; ar: string };
  country_code?: string | null;
  currency_code?: string;
  lead_time_days?: number | null;
  payment_terms?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address_i18n?: { en?: string; ar?: string } | null;
  tax_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface CreateSupplierCatalogBody {
  product_id: string;
  supplier_sku?: string;
  unit_cost_cents: number;
  currency_code?: string;
  is_preferred?: boolean;
  /** ISO date `YYYY-MM-DD`. */
  effective_from?: string;
}

export interface UpdateSupplierCatalogBody {
  supplier_sku?: string | null;
  unit_cost_cents?: number;
  currency_code?: string;
  is_preferred?: boolean;
  /** ISO date `YYYY-MM-DD`, or null to clear. */
  effective_from?: string | null;
}

// ─── request functions ───────────────────────────────────────────────

export function suppliersListRequest(
  opts: { search?: string; active_only?: boolean; page?: number; limit?: number } = {},
): Promise<SuppliersListResponse> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.active_only !== undefined) q.set("active_only", String(opts.active_only));
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/suppliers${qs ? `?${qs}` : ""}`);
}

export function supplierGetRequest(id: string): Promise<ApiSupplierDetail> {
  return apiFetch(`/v1/suppliers/${id}`);
}

export function supplierCreateRequest(body: CreateSupplierBody): Promise<ApiSupplierDetail> {
  return apiFetch(`/v1/suppliers`, { method: "POST", body });
}

export function supplierUpdateRequest(
  id: string,
  body: UpdateSupplierBody,
): Promise<ApiSupplierDetail> {
  return apiFetch(`/v1/suppliers/${id}`, { method: "PATCH", body });
}

export function supplierDeleteRequest(id: string): Promise<{ id: string; deleted_at: string }> {
  return apiFetch(`/v1/suppliers/${id}`, { method: "DELETE" });
}

// ─── catalog ─────────────────────────────────────────────────────────

export function supplierCatalogListRequest(
  supplierId: string,
): Promise<{ items: ApiSupplierCatalogEntry[] }> {
  // Backend returns a raw array; normalize to `{ items }` shape clients prefer.
  // (Mirrors how the controller forwards `listCatalog`'s array result.)
  return apiFetch<ApiSupplierCatalogEntry[] | { items: ApiSupplierCatalogEntry[] }>(
    `/v1/suppliers/${supplierId}/catalog`,
  ).then((res) =>
    Array.isArray(res) ? { items: res } : res,
  );
}

export function supplierCatalogCreateRequest(
  supplierId: string,
  body: CreateSupplierCatalogBody,
): Promise<ApiSupplierCatalogEntry> {
  return apiFetch(`/v1/suppliers/${supplierId}/catalog`, { method: "POST", body });
}

export function supplierCatalogUpdateRequest(
  supplierId: string,
  productId: string,
  body: UpdateSupplierCatalogBody,
): Promise<ApiSupplierCatalogEntry> {
  return apiFetch(`/v1/suppliers/${supplierId}/catalog/${productId}`, {
    method: "PATCH",
    body,
  });
}

export function supplierCatalogDeleteRequest(
  supplierId: string,
  productId: string,
): Promise<{ id: string; deleted_at: string }> {
  return apiFetch(`/v1/suppliers/${supplierId}/catalog/${productId}`, { method: "DELETE" });
}

// ─── documents ───────────────────────────────────────────────────────

export function supplierDocumentsListRequest(
  supplierId: string,
): Promise<{ items: ApiSupplierDocument[] }> {
  // Same shape-normalization as the catalog list above.
  return apiFetch<ApiSupplierDocument[] | { items: ApiSupplierDocument[] }>(
    `/v1/suppliers/${supplierId}/documents`,
  ).then((res) => (Array.isArray(res) ? { items: res } : res));
}

/**
 * Upload a supplier document. Caller assembles the FormData with the file
 * under field `file` and `kind` (+ optional `notes`) as plain text fields.
 * IMPORTANT: do NOT pass a `Content-Type` header — `apiFetch` skips its
 * default JSON content-type when the body is `FormData`, letting the browser
 * supply the correct `multipart/form-data; boundary=…` header.
 */
export function supplierDocumentUploadRequest(
  supplierId: string,
  formData: FormData,
): Promise<ApiSupplierDocument> {
  return apiFetch(`/v1/suppliers/${supplierId}/documents`, {
    method: "POST",
    body: formData,
  });
}

export function supplierDocumentDeleteRequest(
  supplierId: string,
  docId: string,
): Promise<{ id: string; deleted_at: string }> {
  return apiFetch(`/v1/suppliers/${supplierId}/documents/${docId}`, { method: "DELETE" });
}

/**
 * Absolute URL for the controller-streamed document. Suitable for use as an
 * `<a href>` — the endpoint streams the bytes inline with the correct MIME
 * and `Content-Disposition: inline; filename="…"`. Requires the user to be
 * authenticated; the auth cookie travels with the request (the route is
 * tenant-scoped).
 */
export function supplierDocumentDownloadUrl(supplierId: string, docId: string): string {
  return `${API_URL}/v1/suppliers/${supplierId}/documents/${docId}/download`;
}
