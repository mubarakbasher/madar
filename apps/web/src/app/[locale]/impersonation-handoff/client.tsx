"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuthStore } from "@/lib/auth/store";
import { apiFetch, ApiError } from "@/lib/api/client";

interface ExchangeResponse {
  access_token: string;
  expires_at: string;
  expires_in: number;
  impersonator_email: string;
  target_tenant: { id: string; slug: string; name: string };
  target_user: { id: string; email: string; name: string; role: string };
}

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    locale: string;
    branch_id: string | null;
    email_verified: boolean;
    mfa_enabled: boolean;
  };
  tenant: {
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
  };
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
      sessionStorage.setItem(
        "madar_impersonation",
        JSON.stringify({
          admin_email: ex.impersonator_email,
          target_tenant_name: ex.target_tenant.name,
          expires_at: ex.expires_at,
        }),
      );
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
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center", color: "var(--ink-2)" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, marginBlockEnd: 12 }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{t("subtitle")}</p>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginBlockStart: 8 }}>
          {t("warning")}
        </p>

        {!code && (
          <div
            role="alert"
            style={{
              marginBlockStart: 20,
              padding: "12px 16px",
              background: "var(--rose-soft)",
              color: "var(--rose)",
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            {t("errors.missingCode")}
          </div>
        )}

        {code && (
          <div
            style={{
              marginBlockStart: 24,
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
                borderRadius: 10,
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
                borderRadius: 10,
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
              padding: "12px 16px",
              background: "var(--rose-soft)",
              color: "var(--rose)",
              borderRadius: 10,
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
