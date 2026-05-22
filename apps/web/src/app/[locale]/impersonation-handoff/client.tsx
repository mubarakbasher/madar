"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { apiFetch, ApiError } from "@/lib/api/client";

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

export function ImpersonationHandoffClient({
  token,
  tenantName,
  adminEmail,
  expiresAt,
}: {
  token: string;
  tenantName: string;
  adminEmail: string;
  expiresAt: string;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing impersonation token.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        sessionStorage.setItem(
          "madar_impersonation",
          JSON.stringify({
            admin_email: adminEmail,
            target_tenant_name: tenantName,
            expires_at: expiresAt,
          }),
        );
        useAuthStore.getState().setAuth({
          accessToken: token,
          // Placeholder shape; real values come from /me below.
          user: {
            id: "",
            email: "",
            name: "",
            role: "owner",
            locale: "en",
            branch_id: null,
            email_verified: true,
            mfa_enabled: false,
          },
          tenant: {
            id: "",
            slug: "",
            name: tenantName,
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
        if (cancelled) return;
        useAuthStore.getState().setAuth({
          accessToken: token,
          user: me.user,
          tenant: me.tenant,
        });
        window.location.replace("/en");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.message);
        else setError("Could not load tenant context.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tenantName, adminEmail, expiresAt]);

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
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          color: "var(--ink-2)",
        }}
      >
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, marginBottom: 12 }}>
          Starting impersonation…
        </h1>
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>
          Signing you in as a user of <strong>{tenantName}</strong>.
        </p>
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 20,
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
