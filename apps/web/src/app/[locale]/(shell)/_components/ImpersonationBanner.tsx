"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";

const SS_KEY = "madar_impersonation";

interface ImpersonationState {
  admin_email: string;
  target_tenant_name: string;
  expires_at: string;
}

const ADMIN_ORIGIN =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADMIN_WEB_ORIGIN) ||
  "http://localhost:3001";

export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(SS_KEY) : null;
    if (raw) {
      try {
        setState(JSON.parse(raw) as ImpersonationState);
      } catch {
        sessionStorage.removeItem(SS_KEY);
      }
    }
  }, []);

  if (!state) return null;

  async function exit() {
    setExiting(true);
    try {
      await apiFetch("/v1/impersonation/exit", { method: "POST" });
    } catch (err) {
      // Even if the API call fails, clear the session so the user isn't stuck.
      if (!(err instanceof ApiError)) console.error(err);
    } finally {
      sessionStorage.removeItem(SS_KEY);
      useAuthStore.getState().clearAuth();
      window.location.href = ADMIN_ORIGIN + "/tenants";
    }
  }

  return (
    <div
      role="status"
      style={{
        gridColumn: "1 / -1",
        background: "linear-gradient(90deg, var(--rose) 0%, color-mix(in oklab, var(--rose) 75%, #000) 100%)",
        color: "white",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        fontSize: 13,
        position: "sticky",
        top: 0,
        zIndex: 50,
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
      <strong>Impersonating</strong>
      <span style={{ opacity: 0.9 }}>
        You are viewing Madar as <strong>{state.target_tenant_name}</strong> — logged in
        as <strong>{state.admin_email}</strong>. Every action is logged.
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
        <LogOut size={13} strokeWidth={1.75} />
        {exiting ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
