"use client";
import { apiFetch } from "./client";
import type { AuthTenant, AuthUser } from "../auth/store";

export interface AuthSession {
  access_token: string;
  expires_in: number;
  user: AuthUser;
  tenant: AuthTenant;
}

export interface MfaPendingResponse {
  requires_mfa: true;
  mfa_pending_token: string;
  expires_in: number;
}

export type LoginResponse = AuthSession | MfaPendingResponse;

export function isMfaPending(r: LoginResponse): r is MfaPendingResponse {
  return (r as MfaPendingResponse).requires_mfa === true;
}

export function loginRequest(body: { email: string; password: string; remember: boolean }) {
  return apiFetch<LoginResponse>("/v1/auth/login", { method: "POST", body });
}

// ─── forgot / reset / verify-email ─────────────────────────────────

export function forgotPasswordRequest(body: { email: string; locale?: "en" | "ar" }) {
  return apiFetch<Record<string, never>>("/v1/auth/forgot-password", { method: "POST", body });
}

export function resetPasswordRequest(body: { token: string; new_password: string }) {
  return apiFetch<Record<string, never>>("/v1/auth/reset-password", { method: "POST", body });
}

export function verifyEmailRequest(body: { token: string }) {
  return apiFetch<Record<string, never>>("/v1/auth/verify-email", { method: "POST", body });
}

export function resendVerificationRequest(body: { email: string; locale?: "en" | "ar" }) {
  return apiFetch<Record<string, never>>("/v1/auth/resend-verification", { method: "POST", body });
}

// ─── MFA challenge (login second step) ─────────────────────────────

export function mfaVerifyRequest(body: { mfa_pending_token: string; code: string }): Promise<AuthSession> {
  return apiFetch<AuthSession>("/v1/auth/mfa/verify", {
    method: "POST",
    body: { code: body.code },
    headers: { Authorization: `Bearer ${body.mfa_pending_token}` },
  });
}

// ─── MFA enrollment + disable (authed user) ────────────────────────

export interface MfaEnrollStartResponse {
  provisioning_uri: string;
  secret_b32: string;
}

export function mfaEnrollStartRequest(): Promise<MfaEnrollStartResponse> {
  return apiFetch<MfaEnrollStartResponse>("/v1/auth/mfa/enroll/start", { method: "POST", body: {} });
}

export function mfaEnrollVerifyRequest(body: { code: string }): Promise<{ recovery_codes: string[] }> {
  return apiFetch<{ recovery_codes: string[] }>("/v1/auth/mfa/enroll/verify", {
    method: "POST",
    body,
  });
}

export function mfaDisableRequest(body: { password: string }): Promise<Record<string, never>> {
  return apiFetch<Record<string, never>>("/v1/auth/mfa/disable", { method: "POST", body });
}

export function mfaRegenerateRecoveryCodesRequest(body: {
  password: string;
}): Promise<{ recovery_codes: string[] }> {
  return apiFetch<{ recovery_codes: string[] }>("/v1/auth/mfa/recovery-codes/regenerate", {
    method: "POST",
    body,
  });
}

export function signupRequest(body: {
  business_name: string;
  slug: string;
  owner_name: string;
  email: string;
  password: string;
  country_code: string;
  default_currency_code?: string;
  default_locale: "en" | "ar";
}) {
  return apiFetch<AuthSession>("/v1/auth/signup", { method: "POST", body });
}

export function meRequest() {
  return apiFetch<{ user: AuthUser; tenant: AuthTenant }>("/v1/auth/me");
}

// ─── self-service profile (§45) ────────────────────────────────────

export function updateProfileRequest(body: {
  name?: string;
  locale?: "en" | "ar";
}): Promise<{ user: AuthUser; tenant: AuthTenant }> {
  return apiFetch<{ user: AuthUser; tenant: AuthTenant }>("/v1/auth/me", {
    method: "PATCH",
    body,
  });
}

export function changePasswordRequest(body: {
  current_password: string;
  new_password: string;
}): Promise<Record<string, never>> {
  return apiFetch<Record<string, never>>("/v1/auth/change-password", {
    method: "POST",
    body,
  });
}

export function changeEmailRequest(body: {
  new_email: string;
  password: string;
}): Promise<Record<string, never>> {
  return apiFetch<Record<string, never>>("/v1/auth/change-email", {
    method: "POST",
    body,
  });
}

export function logoutRequest() {
  return apiFetch<null>("/v1/auth/logout", { method: "POST" });
}

export function slugAvailableRequest(slug: string) {
  const q = encodeURIComponent(slug);
  return apiFetch<{ available: boolean; reason?: "taken" | "reserved" | "invalid" }>(
    `/v1/auth/slug-available?slug=${q}`,
  );
}
