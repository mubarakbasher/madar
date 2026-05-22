"use client";
import { apiFetch } from "./client";

export type BusinessTypeValue =
  | "retail"
  | "wholesale"
  | "restaurant"
  | "pharmacy"
  | "services"
  | "other";

export interface BusinessSnapshot {
  id: string;
  slug: string;
  name: string;
  name_i18n: { en: string; ar: string };
  country_code: string;
  legal_name: string | null;
  business_type: BusinessTypeValue | null;
  default_currency_code: string;
  timezone: string;
  fiscal_year_start_month: number;
  tax_registration_number: string | null;
  tax_inclusive_default: boolean;
  default_locale: string;
  default_tax_class_id: string | null;
  logo_url: string | null;
  status: string;
  trial_ends_at: string | null;
  plan: { code: string; name_i18n: unknown } | null;
}

export interface UpdateBusinessBody {
  name?: string;
  name_i18n?: { en: string; ar: string };
  legal_name?: string | null;
  business_type?: BusinessTypeValue | null;
  default_currency_code?: string;
  timezone?: string;
  fiscal_year_start_month?: number;
  tax_registration_number?: string | null;
  tax_inclusive_default?: boolean;
  default_locale?: "en" | "ar";
}

export function businessGetRequest(): Promise<BusinessSnapshot> {
  return apiFetch<BusinessSnapshot>(`/v1/tenant`);
}

export function businessUpdateRequest(
  body: UpdateBusinessBody,
): Promise<BusinessSnapshot> {
  return apiFetch<BusinessSnapshot>(`/v1/tenant`, { method: "PATCH", body });
}

export function tenantLogoSetRequest(file: File): Promise<BusinessSnapshot> {
  const form = new FormData();
  form.append("image", file);
  return apiFetch<BusinessSnapshot>(`/v1/tenant/logo`, {
    method: "POST",
    body: form,
  });
}

export function tenantLogoClearRequest(): Promise<BusinessSnapshot> {
  return apiFetch<BusinessSnapshot>(`/v1/tenant/logo`, { method: "DELETE" });
}

/**
 * Build a public URL for the tenant logo. Returns null when no logo is set.
 * The `logo_url` value is used as a cache-busting hint (extension only —
 * matches the product-image public pattern).
 */
export function tenantLogoPublicUrl(
  tenantId: string,
  logoUrl: string | null,
): string | null {
  if (!logoUrl) return null;
  const api =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
    "http://localhost:4000";
  const ext = logoUrl.split(".").pop() ?? "jpg";
  return `${api}/v1/public/tenants/${tenantId}/logo?v=${ext}`;
}
