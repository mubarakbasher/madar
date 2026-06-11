"use client";

import { useState } from "react";
import { X, LogIn } from "lucide-react";
import { adminStartImpersonation, type TenantDetail } from "@/lib/api/admin-tenant-detail";
import { ApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n";

const TENANT_ORIGIN =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TENANT_WEB_ORIGIN) ||
  "http://localhost:3000";

export function LoginAsModal({
  tenant,
  onClose,
}: {
  tenant: TenantDetail;
  onClose: () => void;
}) {
  const owners = tenant.users.filter((u) => u.role === "owner" && u.is_active);
  const candidates = owners.length > 0 ? owners : tenant.users.filter((u) => u.is_active);
  const [targetUserId, setTargetUserId] = useState<string>(candidates[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetUserId || reason.trim().length < 3) {
      setError(t("loginAs.validationError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await adminStartImpersonation(tenant.id, {
        user_id: targetUserId,
        reason: reason.trim(),
      });
      // Open the tenant app's handoff page with ONLY the single-use code —
      // never the JWT (URLs land in history, proxies, and access logs). The
      // handoff page shows a confirmation and exchanges the code via POST.
      const url =
        `${TENANT_ORIGIN}/en/impersonation-handoff` +
        `?code=${encodeURIComponent(res.handoff_code)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(t("loginAs.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in oklab, var(--ink) 50%, transparent)",
        zIndex: 60,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          padding: 24,
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 24px 64px -24px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2
            style={{
              fontFamily: "var(--serif)",
              fontSize: 22,
              letterSpacing: "-0.01em",
            }}
          >
            {t("loginAs.title")}
          </h2>
          <button
            type="button"
            aria-label={t("loginAs.close")}
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink-3)",
              cursor: "pointer",
            }}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <p style={{ marginTop: 8, fontSize: 13, color: "var(--ink-3)" }}>
          {t("loginAs.description", { tenantName: tenant.name })}
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>
              {t("loginAs.signInAs")}
            </span>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              style={inputStyle()}
            >
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.email} ({u.role})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block" }}>
            <span style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>
              {t("loginAs.reasonLabel")}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={280}
              placeholder={t("loginAs.reasonPlaceholder")}
              style={{ ...inputStyle(), height: "auto", paddingBlock: 10, resize: "vertical" }}
            />
            <span style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, display: "block" }}>
              {t("loginAs.reasonCount", { count: reason.length })}
            </span>
          </label>

          {error && (
            <div
              style={{
                background: "var(--rose-soft)",
                color: "var(--rose)",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 10,
                color: "var(--ink-2)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("loginAs.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "10px 18px",
                background: "var(--rose)",
                border: "none",
                borderRadius: 10,
                color: "white",
                fontSize: 13,
                fontWeight: 500,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <LogIn size={14} strokeWidth={1.5} />
              {submitting ? t("loginAs.submitting") : t("loginAs.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--rule)",
    background: "var(--bg)",
    color: "var(--ink)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  };
}
