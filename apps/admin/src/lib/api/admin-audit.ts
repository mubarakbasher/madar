import { adminApiFetch } from "./client";

export interface PlatformAuditItem {
  id: string;
  platform_user: { id: string; email: string; name: string };
  action: string;
  target_tenant: { id: string; slug: string; name: string } | null;
  target_entity: string | null;
  target_id: string | null;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ListPlatformAuditResponse {
  items: PlatformAuditItem[];
  total: number;
  page: number;
  limit: number;
}

export interface LoginAsSessionItem {
  id: string;
  platform_user: { id: string; email: string; name: string };
  target_tenant: { id: string; slug: string; name: string };
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  actions_count: number;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
}

export interface ListLoginAsResponse {
  items: LoginAsSessionItem[];
  total: number;
  page: number;
  limit: number;
}

export function adminListPlatformAudit(opts: {
  platform_user_id?: string;
  action_prefix?: string;
  page?: number;
  limit?: number;
}): Promise<ListPlatformAuditResponse> {
  const q = new URLSearchParams();
  if (opts.platform_user_id) q.set("platform_user_id", opts.platform_user_id);
  if (opts.action_prefix) q.set("action_prefix", opts.action_prefix);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return adminApiFetch<ListPlatformAuditResponse>(`/v1/admin/platform-audit${qs ? `?${qs}` : ""}`);
}

export function adminListLoginAs(opts: {
  platform_user_id?: string;
  target_tenant_id?: string;
  page?: number;
  limit?: number;
}): Promise<ListLoginAsResponse> {
  const q = new URLSearchParams();
  if (opts.platform_user_id) q.set("platform_user_id", opts.platform_user_id);
  if (opts.target_tenant_id) q.set("target_tenant_id", opts.target_tenant_id);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return adminApiFetch<ListLoginAsResponse>(`/v1/admin/login-as-audit${qs ? `?${qs}` : ""}`);
}
