"use client";
import { apiFetch } from "./client";
import type { ApiPlan } from "./billing";

export interface SelectPlanResult {
  tenant_id: string;
  plan_id: string;
  plan_code: string;
}

/**
 * Public — no auth required. Used by the post-signup picker. Returns only
 * active plans, sorted by price ascending.
 */
export function publicPlansRequest(): Promise<{ items: ApiPlan[]; total: number }> {
  return apiFetch<{ items: ApiPlan[]; total: number }>("/v1/public/plans");
}

/**
 * Assigns a plan to the current tenant. One-shot — re-picks return 409.
 */
export function selectPlanRequest(planId: string): Promise<SelectPlanResult> {
  return apiFetch<SelectPlanResult>("/v1/onboarding/select-plan", {
    method: "POST",
    body: { plan_id: planId },
  });
}
