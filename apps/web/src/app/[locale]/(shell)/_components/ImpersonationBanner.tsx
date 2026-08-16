"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import {
  clearImpersonation,
  readImpersonation,
  type ImpersonationSession,
} from "@/lib/auth/impersonation";

const ADMIN_ORIGIN =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADMIN_WEB_ORIGIN) ||
  "http://localhost:3001";

export function ImpersonationBanner() {
  const t = useTranslations("shell.impersonation");
  const [state, setState] = useState<ImpersonationSession | null>(null);
  const [exiting, setExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  useEffect(() => {
    setState(readImpersonation());
  }, []);

  if (!state) return null;

  async function exit() {
    setExiting(true);
    setExitError(null);
    try {
      // Only tear down on success. A failed exit means the server never wrote
      // `impersonation_ended`, so the session stays open in the platform audit
      // — swallowing the error here made that invisible, and the admin was
      // returned to the console as if everything had gone fine.
      await apiFetch("/v1/impersonation/exit", { method: "POST" });
    } catch (err) {
      setExiting(false);
      setExitError(err instanceof ApiError ? err.message : t("exitFailed"));
      return;
    }
    clearImpersonation();
    useAuthStore.getState().clearAuth();
    window.location.href = ADMIN_ORIGIN + "/tenants";
  }

  return (
    <div
      role="status"
      style={{
        background: "linear-gradient(90deg, var(--rose) 0%, color-mix(in oklab, var(--rose) 75%, #000) 100%)",
        color: "white",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        fontSize: 13,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 0 0 4px color-mix(in oklab, white 30%, transparent)",
        }}
      />
      <strong>{t("label")}</strong>
      <span style={{ opacity: 0.9 }}>
        {t.rich("body", {
          strong: (chunks) => <strong>{chunks}</strong>,
          tenant: state.target_tenant_name,
          admin: state.admin_email,
        })}
      </span>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        style={{
          background: "white",
          color: "var(--rose)",
          padding: "6px 14px",
          borderRadius: 8,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: exiting ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <LogOut size={13} strokeWidth={1.5} />
        {exiting ? t("exiting") : t("exit")}
      </button>
      {exitError && (
        <span role="alert" style={{ fontSize: 12, fontWeight: 600 }}>
          {exitError}
        </span>
      )}
    </div>
  );
}
