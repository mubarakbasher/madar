import { adminApiFetch } from "./client";

export interface PlanResponse {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  monthly_price_cents: string;
  currency_code: string;
  limits: { txns: number; users: number; branches: number; storage_gb: number };
  is_active: boolean;
  tenant_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanInput {
  code: string;
  name_en: string;
  name_ar: string;
  monthly_price_cents: number;
  currency_code: string;
  limits: { txns: number; users: number; branches: number; storage_gb: number };
}

export type UpdatePlanInput = Partial<Omit<CreatePlanInput, "code">>;

export function adminListPlans(includeInactive: boolean): Promise<PlanResponse[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  return adminApiFetch<PlanResponse[]>(`/v1/admin/plans${qs}`);
}

export function adminGetPlan(id: string): Promise<PlanResponse> {
  return adminApiFetch<PlanResponse>(`/v1/admin/plans/${id}`);
}

export function adminCreatePlan(body: CreatePlanInput): Promise<PlanResponse> {
  return adminApiFetch<PlanResponse>("/v1/admin/plans", { method: "POST", body });
}

export function adminUpdatePlan(id: string, body: UpdatePlanInput): Promise<PlanResponse> {
  return adminApiFetch<PlanResponse>(`/v1/admin/plans/${id}`, { method: "PATCH", body });
}

export function adminSetPlanActive(id: string, active: boolean): Promise<PlanResponse> {
  return adminApiFetch<PlanResponse>(`/v1/admin/plans/${id}/${active ? "activate" : "deactivate"}`, {
    method: "POST",
  });
}
