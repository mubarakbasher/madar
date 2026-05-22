"use client";
import { apiFetch } from "./client";

// Mirrors enum TenantUserRole in packages/db/prisma/schema.prisma.
// Owner-managed tenant users; no platform-user roles here.
export type TenantUserRole = "owner" | "manager" | "cashier" | "accountant" | "auditor";

export interface ApiTenantUser {
  id: string;
  email: string;
  name: string;
  role: TenantUserRole;
  branch_id: string | null;
  branch_code: string | null;
  branch_name_i18n: { en: string; ar: string } | null;
  is_active: boolean;
  mfa_enabled: boolean;
  email_verified: boolean;
  has_pending_invite: boolean;
  created_at: string;
}

export interface UsersListResponse {
  items: ApiTenantUser[];
  total: number;
  page: number;
  limit: number;
}

export interface InviteUserBody {
  email: string;
  name: string;
  role: TenantUserRole;
  branch_id?: string | null;
}

export interface UpdateUserBody {
  role?: TenantUserRole;
  branch_id?: string | null;
  is_active?: boolean;
}

export interface ResendInviteResponse {
  id: string;
  expires_at: string;
}

export interface ApproverSummary {
  id: string;
  name: string;
  role: "owner" | "manager";
}

export interface ApproversListResponse {
  items: ApproverSummary[];
}

// Open to any authed tenant user — used by the refund wizard's manager-
// approval modal. Backend re-verifies the picked role on the refund POST.
export function approversListRequest(): Promise<ApproversListResponse> {
  return apiFetch<ApproversListResponse>(`/v1/users/approvers`);
}

export function usersListRequest(
  opts: { search?: string; active_only?: boolean; page?: number; limit?: number } = {},
): Promise<UsersListResponse> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.active_only !== undefined) q.set("active_only", String(opts.active_only));
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<UsersListResponse>(`/v1/users${qs ? `?${qs}` : ""}`);
}

export function userInviteRequest(body: InviteUserBody): Promise<ApiTenantUser> {
  return apiFetch<ApiTenantUser>(`/v1/users/invite`, { method: "POST", body });
}

export function userUpdateRequest(id: string, body: UpdateUserBody): Promise<ApiTenantUser> {
  return apiFetch<ApiTenantUser>(`/v1/users/${id}`, { method: "PATCH", body });
}

export function userResendInviteRequest(id: string): Promise<ResendInviteResponse> {
  return apiFetch<ResendInviteResponse>(`/v1/users/${id}/resend-invite`, { method: "POST" });
}

export interface ResetPasswordResponse {
  id: string;
  expires_at: string;
}

export function userResetPasswordRequest(id: string): Promise<ResetPasswordResponse> {
  return apiFetch<ResetPasswordResponse>(`/v1/users/${id}/reset-password`, { method: "POST" });
}
