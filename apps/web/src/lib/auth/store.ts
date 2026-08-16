"use client";
import { create } from "zustand";
import { DISPLAY_COOKIE, encodeDisplayPrefs } from "@madar/ui";

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
  /** Display-only rendering preferences — see packages/ui/src/format-locale.ts.
   *  Storage is always Western digits and Gregorian ISO 8601 UTC. */
  use_arabic_indic_digits: boolean;
  use_hijri_calendar: boolean;
  plan: { code: string; name_i18n: unknown } | null;
}

/**
 * Mirror the tenant's display preferences into a cookie.
 *
 * The server needs them before hydration to render the first paint in the
 * right numeral system, and an offline POS session needs them at all: when
 * /v1/auth/refresh fails, `tenant` stays null for the whole shift and the
 * cookie is the only surviving copy.
 *
 * Not HttpOnly — the client reads it too — and display-only, so it carries
 * nothing sensitive. Stamped with the tenant id so a cookie left by another
 * tenant on a shared till decodes to the defaults instead of their setting.
 */
function syncDisplayCookie(tenant: AuthTenant | null): void {
  if (typeof document === "undefined") return;
  if (!tenant) {
    document.cookie = `${DISPLAY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    return;
  }
  const value = encodeDisplayPrefs(
    {
      numerals: tenant.use_arabic_indic_digits ? "arab" : "latn",
      calendar: tenant.use_hijri_calendar ? "islamic" : "gregory",
    },
    tenant.id,
  );
  document.cookie = `${DISPLAY_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  tenant: AuthTenant | null;
  bootstrapped: boolean;
  setAuth: (p: { accessToken: string; user: AuthUser; tenant: AuthTenant }) => void;
  /** Refresh user + tenant from a /v1/auth/me response, keeping the token.
   *  Use this instead of a raw `setState` so the display cookie stays in step —
   *  otherwise a saved preference reverts on the next reload and reads to the
   *  user as "the setting didn't save". */
  setSession: (p: { user: AuthUser; tenant: AuthTenant }) => void;
  patchUser: (partial: Partial<AuthUser>) => void;
  clearAuth: () => void;
  setBootstrapped: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  tenant: null,
  bootstrapped: false,
  setAuth: ({ accessToken, user, tenant }) => {
    syncDisplayCookie(tenant);
    set({ accessToken, user, tenant, bootstrapped: true });
  },
  setSession: ({ user, tenant }) => {
    syncDisplayCookie(tenant);
    set({ user, tenant });
  },
  patchUser: (partial) =>
    set((s) => (s.user ? { user: { ...s.user, ...partial } } : {})),
  clearAuth: () => {
    syncDisplayCookie(null);
    set({ accessToken: null, user: null, tenant: null, bootstrapped: true });
  },
  setBootstrapped: () => set({ bootstrapped: true }),
}));
