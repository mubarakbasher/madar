"use client";
import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  locale: string;
  branch_id: string | null;
  email_verified: boolean;
  mfa_enabled: boolean;
}

export interface AuthTenant {
  id: string;
  slug: string;
  name: string;
  default_locale: string;
  default_currency_code: string;
  country_code: string;
  status: string;
  trial_ends_at: string | null;
  default_tax_class_id: string | null;
  tax_inclusive_default: boolean;
  plan: { code: string; name_i18n: unknown } | null;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  tenant: AuthTenant | null;
  bootstrapped: boolean;
  setAuth: (p: { accessToken: string; user: AuthUser; tenant: AuthTenant }) => void;
  clearAuth: () => void;
  setBootstrapped: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  tenant: null,
  bootstrapped: false,
  setAuth: ({ accessToken, user, tenant }) =>
    set({ accessToken, user, tenant, bootstrapped: true }),
  clearAuth: () => set({ accessToken: null, user: null, tenant: null, bootstrapped: true }),
  setBootstrapped: () => set({ bootstrapped: true }),
}));
