import { adminApiFetch } from "./client";

export interface KpiResponse {
  monthly_recurring: { amount_cents: string; currency_code: string; delta_pct_30d: number | null };
  active_tenants: { count: number; delta_7d: number };
  trials_ending_soon: { count: number; window_days: number };
  pending_verifications: { count: number; oldest_days: number | null };
  system_health: {
    status: "healthy" | "degraded" | "incident";
    uptime_30d_pct: number;
    last_incident_at: string | null;
  };
}

export interface ActivityItem {
  kind: "tenant_signup" | "sale_completed" | "verification_pending";
  occurred_at: string;
  tenant_id: string;
  tenant_name: string;
  text: string;
}

export interface ActivityResponse {
  items: ActivityItem[];
}

export function adminFetchKpi(): Promise<KpiResponse> {
  return adminApiFetch<KpiResponse>("/v1/admin/dashboard/kpi");
}

export function adminFetchActivity(limit = 50): Promise<ActivityResponse> {
  return adminApiFetch<ActivityResponse>(`/v1/admin/dashboard/activity?limit=${limit}`);
}
