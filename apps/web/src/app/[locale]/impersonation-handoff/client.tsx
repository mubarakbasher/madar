"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuthStore, type AuthTenant, type AuthUser } from "@/lib/auth/store";
import { writeImpersonation } from "@/lib/auth/impersonation";
import { apiFetch, ApiError } from "@/lib/api/client";

interface ExchangeResponse {
  access_token: string;
  expires_at: string;
  expires_in: number;
  impersonator_email: string;
  target_tenant: { id: string; slug: string; name: string };
  target_user: { id: string; email: string; name: string; role: string };
}

// Reuses the store's shapes rather than re-declaring them: this was a
// fourth hand-rolled copy of the tenant DTO, and every field added to the
// tenant since has had to be typed into each copy by hand.
interface MeResponse {
  user: AuthUser;
  tenant: AuthTenant;
}

/**
 * Interstitial: the session is NOT touched until the user explicitly
 * confirms. A drive-by link must not be able to silently swap a cashier's
 * session for an attacker-controlled tenant (login-CSRF) — and the single-use
 * code is only consumed on confirmation.
 */
export function ImpersonationHandoffClient({ code }: { code: string }) {
  const t = useTranslations("impersonationHandoff");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const ex = await apiFetch<ExchangeResponse>("/v1/impersonation/exchange", {
        method: "POST",
        body: { code },
      });
      // Includes the access token: the redirect below is a full page load,
      // so anything left only in the Zustand store is gone (see
      // lib/auth/impersonation.ts).
      writeImpersonation({
        admin_email: ex.impersonator_email,
        target_tenant_name: ex.target_tenant.name,
        expires_at: ex.expires_at,
        access_token: ex.access_token,
      });
      useAuthStore.getState().setAuth({
        accessToken: ex.access_token,
        user: {
          id: ex.target_user.id,
          email: ex.target_user.email,
          name: ex.target_user.name,
          role: ex.target_user.role as MeResponse["user"]["role"],
          locale: "en",
          branch_id: null,
          email_verified: true,
          mfa_enabled: false,
        },
        tenant: {
          id: ex.target_tenant.id,
          slug: ex.target_tenant.slug,
          name: ex.target_tenant.name,
          default_locale: "en",
          default_currency_code: "EGP",
          country_code: "EG",
          status: "active",
          trial_ends_at: null,
          default_tax_class_id: null,
          tax_inclusive_default: false,
          // Product defaults; the real values arrive with /v1/auth/me below.
          use_arabic_indic_digits: false,
          use_hijri_calendar: false,
          plan: null,
        },
      });
      const me = await apiFetch<MeResponse>("/v1/auth/me");
      useAuthStore.getState().setAuth({
        accessToken: ex.access_token,
        user: me.user,
        tenant: me.tenant,
      });
      window.location.replace(`/${locale}`);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.code === "handoff_code_invalid") {
        setError(t("errors.codeInvalid"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("errors.network"));
      }
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: "var(--space-5)",
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center", color: "var(--ink-2)" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, marginBlockEnd: "var(--space-3)" }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{t("subtitle")}</p>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginBlockStart: "var(--space-2)" }}>
          {t("warning")}
        </p>

        {!code && (
          <div
            role="alert"
            style={{
              marginBlockStart: 20,
              padding: "var(--space-3) var(--space-4)",
              background: "var(--rose-soft)",
              color: "var(--rose)",
              borderRadius: "var(--radius)",
              fontSize: 13,
            }}
          >
            {t("errors.missingCode")}
          </div>
        )}

        {code && (
          <div
            style={{
              marginBlockStart: "var(--space-5)",
              display: "flex",
              gap: 10,
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => window.close()}
              style={{
                padding: "10px 18px",
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius)",
                color: "var(--ink-2)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              style={{
                padding: "10px 18px",
                background: "var(--rose)",
                border: "none",
                borderRadius: "var(--radius)",
                color: "white",
                fontSize: 13,
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? t("confirming") : t("confirm")}
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginBlockStart: 20,
              padding: "var(--space-3) var(--space-4)",
              background: "var(--rose-soft)",
              color: "var(--rose)",
              borderRadius: "var(--radius)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
