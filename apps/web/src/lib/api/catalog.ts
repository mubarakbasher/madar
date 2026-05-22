"use client";
import { apiFetch } from "./client";

const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export interface ApiCategory {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  sort_order: number;
  parent_id: string | null;
  product_count: number;
}

export interface ApiProduct {
  id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  description_i18n: { en?: string; ar?: string } | null;
  category_id: string | null;
  category_code: string | null;
  tax_class_id: string | null;
  /** Effective tax rate as a percentage (e.g. 14 for 14%). Resolves to the
   *  product's class, else the tenant default, else null. */
  tax_rate_pct: number | null;
  price_cents: string;
  cost_cents: string;
  currency_code: string;
  barcode: string | null;
  is_active: boolean;
  image_url: string | null;
  qty_on_hand: number;
  reorder_point: number | null;
  velocity_per_week: number;
}

// Legacy ApiBranch alias — kept for the ProductForm initial-stock picker.
// The canonical type now lives in @/lib/api/branches (ApiBranchSummary).
// Imported there as a re-export for backwards compatibility.
export type { ApiBranchSummary as ApiBranch, BranchesListResponse as ApiBranchesList } from "./branches";

export interface ApiCategoriesList {
  items: ApiCategory[];
  total: number;
}

export interface ApiProductsList {
  items: ApiProduct[];
  total: number;
  limit: number;
}

export interface ProductInitialStockEntry {
  branch_id: string;
  qty: number;
  reorder_point?: number;
  reorder_qty?: number;
}

export interface CreateProductBody {
  sku: string;
  name_i18n: { en: string; ar: string };
  description_i18n?: { en?: string; ar?: string } | null;
  category_id?: string | null;
  tax_class_id?: string | null;
  price_cents: number;
  cost_cents: number;
  currency_code: string;
  barcode?: string | null;
  is_active?: boolean;
  initial_stock?: ProductInitialStockEntry[];
}

export interface UpdateProductBody {
  sku?: string;
  name_i18n?: { en: string; ar: string };
  description_i18n?: { en?: string; ar?: string } | null;
  category_id?: string | null;
  tax_class_id?: string | null;
  price_cents?: number;
  cost_cents?: number;
  currency_code?: string;
  barcode?: string | null;
  is_active?: boolean;
}

export interface CreateCategoryBody {
  code: string;
  name_i18n: { en: string; ar: string };
  sort_order?: number;
  parent_id?: string | null;
}

export interface UpdateCategoryBody {
  code?: string;
  name_i18n?: { en: string; ar: string };
  sort_order?: number;
  parent_id?: string | null;
}

export function categoriesListRequest(): Promise<ApiCategoriesList> {
  return apiFetch<ApiCategoriesList>("/v1/categories");
}

export function productsListRequest(
  params: { search?: string; category_id?: string; branch_id?: string; only_low_stock?: boolean } = {},
): Promise<ApiProductsList> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.category_id) q.set("category_id", params.category_id);
  if (params.branch_id) q.set("branch_id", params.branch_id);
  if (params.only_low_stock) q.set("only_low_stock", "true");
  const qs = q.toString();
  return apiFetch<ApiProductsList>(`/v1/products${qs ? `?${qs}` : ""}`);
}

export function productGetRequest(id: string): Promise<ApiProduct> {
  return apiFetch<ApiProduct>(`/v1/products/${id}`);
}

export interface ApiPerBranchStock {
  branch_id: string;
  branch_code: string;
  branch_name_i18n: { en: string; ar: string };
  qty_on_hand: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  available: number;
  last_movement_at: string | null;
}

export interface ApiProductKpis {
  total_stock_value_cents: string;
  units_sold_30d: number;
  velocity_per_day: number;
  days_of_cover: number | null;
}

export interface ApiProductDetail extends ApiProduct {
  per_branch_stock: ApiPerBranchStock[];
  kpis: ApiProductKpis;
}

export interface ApiMovementItem {
  id: string;
  branch_id: string;
  branch_code: string;
  kind: string;
  qty_delta: number;
  unit_cost_cents: string | null;
  reference_table: string | null;
  reference_id: string | null;
  note: string | null;
  occurred_at: string;
}

export interface ApiActivityItem {
  id: string;
  user_id: string | null;
  user_name: string | null;
  impersonator_id: string | null;
  action: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function productDetailRequest(id: string): Promise<ApiProductDetail> {
  return apiFetch<ApiProductDetail>(`/v1/products/${id}/detail`);
}

export function productMovementsRequest(
  id: string,
  opts: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<ApiMovementItem>> {
  const q = new URLSearchParams();
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/products/${id}/movements${qs ? `?${qs}` : ""}`);
}

export function productActivityRequest(
  id: string,
  opts: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<ApiActivityItem>> {
  const q = new URLSearchParams();
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch(`/v1/products/${id}/activity${qs ? `?${qs}` : ""}`);
}

export { branchesListRequest } from "./branches";

export function productCreateRequest(body: CreateProductBody): Promise<ApiProduct> {
  return apiFetch<ApiProduct>("/v1/products", { method: "POST", body });
}

export function productUpdateRequest(id: string, body: UpdateProductBody): Promise<ApiProduct> {
  return apiFetch<ApiProduct>(`/v1/products/${id}`, { method: "PATCH", body });
}

export function productDeleteRequest(id: string): Promise<{ id: string; deleted_at: string }> {
  return apiFetch<{ id: string; deleted_at: string }>(`/v1/products/${id}`, { method: "DELETE" });
}

export function categoryCreateRequest(body: CreateCategoryBody): Promise<ApiCategory> {
  return apiFetch<ApiCategory>("/v1/categories", { method: "POST", body });
}

export function categoryUpdateRequest(id: string, body: UpdateCategoryBody): Promise<ApiCategory> {
  return apiFetch<ApiCategory>(`/v1/categories/${id}`, { method: "PATCH", body });
}

export function categoryDeleteRequest(id: string): Promise<{ id: string; deleted_at: string }> {
  return apiFetch<{ id: string; deleted_at: string }>(`/v1/categories/${id}`, { method: "DELETE" });
}

// ─── Product images (1.8e) ───────────────────────────────────────

export function productSetImageRequest(productId: string, file: File): Promise<ApiProduct> {
  const fd = new FormData();
  fd.set("image", file);
  return apiFetch<ApiProduct>(`/v1/products/${productId}/image`, { method: "POST", body: fd });
}

export function productClearImageRequest(productId: string): Promise<ApiProduct> {
  return apiFetch<ApiProduct>(`/v1/products/${productId}/image`, { method: "DELETE" });
}

/**
 * Public image URL safe for direct use in `<img src>`. Cache-busts on image
 * change by appending a marker derived from the product's `image_url` (which
 * encodes the file extension and acts as a content hash). When the column is
 * null this returns `null` and callers fall back to the gradient swatch.
 */
export function productImagePublicUrl(
  tenantId: string,
  productId: string,
  imageUrl: string | null,
): string | null {
  if (!imageUrl) return null;
  const v = imageUrl.split(".").pop() ?? "v";
  return `${API_URL}/v1/public/tenants/${tenantId}/products/${productId}/image?v=${v}`;
}

// ─── CSV import (Slice 5) ──────────────────────────────────────────

export interface CsvImportError {
  row: number;
  sku: string | null;
  code: string;
  message: string;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  errors: CsvImportError[];
  total_rows: number;
}

export function productsCsvImportRequest(
  file: File,
  opts: { dryRun?: boolean } = {},
): Promise<CsvImportResult> {
  const form = new FormData();
  form.append("file", file);
  const qs = opts.dryRun ? "?dry_run=1" : "";
  return apiFetch<CsvImportResult>(`/v1/products/import${qs}`, {
    method: "POST",
    body: form,
  });
}
