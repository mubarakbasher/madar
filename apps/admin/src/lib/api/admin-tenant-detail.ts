import { adminApiFetch } from "./client";
import type { TenantStatus } from "./admin-tenants";

export interface TenantDetailUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface TenantDetailBranch {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  currency_code: string;
  is_active: boolean;
  opened_at: string | null;
}

export interface TenantDetailInvoice {
  id: string;
  reference_code: string;
  status: string;
  amount_cents: string;
  currency_code: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
}

export interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  name_i18n: { en: string; ar: string };
  country_code: string;
  default_currency_code: string;
  default_locale: string;
  status: TenantStatus;
  trial_ends_at: string | null;
  created_at: string;
  // null when the tenant signed up but hasn't picked a plan yet.
  plan: {
    id: string;
    code: string;
    name: string;
    monthly_price_cents: string;
    currency_code: string;
  } | null;
  kpis: {
    last_30d_revenue_cents: string;
    last_30d_sale_count: number;
    branch_count: number;
    user_count: number;
    last_activity_at: string | null;
  };
  branches: TenantDetailBranch[];
  users: TenantDetailUser[];
  recent_invoices: TenantDetailInvoice[];
}

export function adminGetTenant(id: string): Promise<TenantDetail> {
  return adminApiFetch<TenantDetail>(`/v1/admin/tenants/${id}`);
}

export interface ImpersonationStartResponse {
  // Single-use code the tenant app exchanges for the JWT — the token itself
  // never travels in a URL.
  handoff_code: string;
  expires_at: string;
  expires_in: number;
  jti: string;
  target_tenant: { id: string; slug: string; name: string };
  target_user: { id: string; email: string; name: string; role: string };
}

export function adminStartImpersonation(
  tenantId: string,
  body: { user_id: string; reason: string },
): Promise<ImpersonationStartResponse> {
  return adminApiFetch<ImpersonationStartResponse>(
    `/v1/admin/tenants/${tenantId}/impersonate`,
    { method: "POST", body },
  );
}
