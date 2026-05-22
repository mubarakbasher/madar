import { adminApiFetch } from "./client";
import type { AdminUser } from "../auth/store";

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  mfa_pending_token: string;
  mfa_pending_expires_in: number;
}

export interface AdminAuthResponse {
  access_token: string;
  expires_in: number;
  platform_user: AdminUser;
}

export function adminLogin(body: AdminLoginRequest): Promise<AdminLoginResponse> {
  return adminApiFetch<AdminLoginResponse>("/v1/admin/auth/login", {
    method: "POST",
    body,
  });
}

export function adminMfaVerify(code: string, mfaPendingToken: string): Promise<AdminAuthResponse> {
  return adminApiFetch<AdminAuthResponse>("/v1/admin/auth/mfa/verify", {
    method: "POST",
    body: { code },
    headers: { Authorization: `Bearer ${mfaPendingToken}` },
  });
}

export function adminMe(): Promise<{ platform_user: AdminUser }> {
  return adminApiFetch<{ platform_user: AdminUser }>("/v1/admin/auth/me");
}

export function adminLogout(): Promise<void> {
  return adminApiFetch<void>("/v1/admin/auth/logout", { method: "POST" });
}
