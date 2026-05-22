import { adminApiFetch } from "./client";

export type TenantStatus = "trialing" | "active" | "grace_period" | "suspended" | "cancelled";

export interface TenantListItem {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  plan: { id: string; code: string; name: string };
  status: TenantStatus;
  branch_count: number;
  user_count: number;
  mrr_cents: string;
  currency_code: string;
  created_at: string;
  trial_ends_at: string | null;
  last_activity_at: string | null;
}

export interface ListTenantsResponse {
  items: TenantListItem[];
  total: number;
  page: number;
  limit: number;
  total_countries: number;
}

export interface ListTenantsQuery {
  status?: TenantStatus;
  plan_code?: string;
  country_code?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function adminListTenants(query: ListTenantsQuery = {}): Promise<ListTenantsResponse> {
  const q = new URLSearchParams();
  if (query.status) q.set("status", query.status);
  if (query.plan_code) q.set("plan_code", query.plan_code);
  if (query.country_code) q.set("country_code", query.country_code);
  if (query.search) q.set("search", query.search);
  if (query.page) q.set("page", String(query.page));
  if (query.limit) q.set("limit", String(query.limit));
  const qs = q.toString();
  return adminApiFetch<ListTenantsResponse>(`/v1/admin/tenants${qs ? `?${qs}` : ""}`);
}
