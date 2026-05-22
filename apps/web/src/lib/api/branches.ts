"use client";
import { apiFetch } from "./client";

export interface ApiBranchSummary {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  address_i18n: { en?: string; ar?: string } | null;
  currency_code: string;
  timezone: string;
  is_active: boolean;
  opened_at: string | null;
  today_revenue_cents: string;
  staff_count: number;
  product_count: number;
  geo_lat: number | null;
  geo_lng: number | null;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}
export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type OperatingHours = Record<WeekDay, DayHours>;
export interface Holiday {
  date: string;
  label_i18n: { en: string; ar: string };
}

export interface ApiBranchUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ApiBranchActivity {
  id: string;
  kind: "audit" | "sale";
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  reference: string | null;
}

export interface ApiBranchKpis {
  today_revenue_cents: string;
  week_revenue_cents: string;
  transactions_today: number;
  transactions_week: number;
  top_product_id: string | null;
  top_product_name: { en: string; ar: string } | null;
  units_sold_top_product: number;
}

export interface ApiBranchDetail extends ApiBranchSummary {
  kpis: ApiBranchKpis;
  users: ApiBranchUser[];
  recent_activity: ApiBranchActivity[];
  operating_hours: OperatingHours | null;
  holidays: Holiday[] | null;
}

export interface ApiBranchDashboard {
  branch_id: string;
  branch_name_i18n: { en: string; ar: string };
  currency_code: string;
  today_cents: string;
  yesterday_cents: string;
  vs_yesterday_pct: number | null;
  transactions_today: number;
  items_sold_today: number;
  avg_basket_cents: string;
  returns_today: number;
  hourly: Array<{ hour: number; cents: number }>;
  top_categories: Array<{
    category_id: string | null;
    category_code: string | null;
    name_i18n: { en: string; ar: string } | null;
    cents: number;
  }>;
  leaderboard: Array<{
    branch_id: string;
    name_i18n: { en: string; ar: string };
    today_cents: string;
    rank: number;
  }>;
  my_rank: number | null;
}

export interface ApiBranchStockRow {
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  category_id: string | null;
  category_code: string | null;
  qty_on_hand: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  available: number;
  last_movement_at: string | null;
  image_url: string | null;
}

export interface BranchStockResponse {
  items: ApiBranchStockRow[];
  total: number;
  page: number;
  limit: number;
}

export interface BranchesListResponse {
  items: ApiBranchSummary[];
  total: number;
}

export interface CreateBranchBody {
  code: string;
  name_i18n: { en: string; ar: string };
  address_i18n?: { en?: string; ar?: string } | null;
  currency_code?: string;
  timezone?: string;
  opened_at?: string;
  is_active?: boolean;
  operating_hours?: OperatingHours;
  holidays?: Holiday[];
  geo_lat?: number | null;
  geo_lng?: number | null;
}

export interface UpdateBranchBody {
  code?: string;
  name_i18n?: { en: string; ar: string };
  address_i18n?: { en?: string; ar?: string } | null;
  currency_code?: string;
  timezone?: string;
  opened_at?: string | null;
  is_active?: boolean;
  operating_hours?: OperatingHours | null;
  holidays?: Holiday[] | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
}

export function branchesListRequest(opts: { include_inactive?: boolean } = {}): Promise<BranchesListResponse> {
  const q = new URLSearchParams();
  if (opts.include_inactive) q.set("include_inactive", "true");
  const qs = q.toString();
  return apiFetch<BranchesListResponse>(`/v1/branches${qs ? `?${qs}` : ""}`);
}

export function branchGetRequest(id: string): Promise<ApiBranchDetail> {
  return apiFetch<ApiBranchDetail>(`/v1/branches/${id}`);
}

export function branchStockRequest(
  id: string,
  opts: { search?: string; low_only?: boolean; page?: number; limit?: number } = {},
): Promise<BranchStockResponse> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.low_only) q.set("low_only", "true");
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<BranchStockResponse>(`/v1/branches/${id}/stock${qs ? `?${qs}` : ""}`);
}

export function branchCreateRequest(body: CreateBranchBody): Promise<ApiBranchDetail> {
  return apiFetch<ApiBranchDetail>("/v1/branches", { method: "POST", body });
}

export function branchUpdateRequest(id: string, body: UpdateBranchBody): Promise<ApiBranchDetail> {
  return apiFetch<ApiBranchDetail>(`/v1/branches/${id}`, { method: "PATCH", body });
}

export function branchDeleteRequest(id: string): Promise<{ id: string; deleted_at: string }> {
  return apiFetch<{ id: string; deleted_at: string }>(`/v1/branches/${id}`, { method: "DELETE" });
}

export function branchDashboardRequest(id: string): Promise<ApiBranchDashboard> {
  return apiFetch<ApiBranchDashboard>(`/v1/branches/${id}/dashboard`);
}
