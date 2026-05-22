"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { mfaDisableRequest } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export function DisableMfaModal({ onClose }: { onClose: (disabled: boolean) => void }) {
  const t = useTranslations("auth.mfa.disable");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      await mfaDisableRequest({ password });
      onClose(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError(t("errors.wrongPassword"));
        } else if (err.code === "mfa_not_enabled") {
          setError(t("errors.notEnabled"));
        } else {
          setError(err.message);
        }
      } else {
        setError("Network error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      onClick={() => onClose(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 60,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "100%",
          background: "var(--bg-elev)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderBlockEnd: "1px solid var(--rule)",
          }}
        >
          <h2 style={{ fontFamily: "var(--serif, Fraunces, serif)", fontSize: 18, margin: 0 }}>
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={() => onClose(false)}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-2)" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div style={{ padding: 18 }}>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginBlockEnd: 12 }}>{t("body")}</p>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--ink-2)",
              marginBlockEnd: 4,
            }}
          >
            {t("passwordLabel")}
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              fontSize: 13,
              background: "var(--bg)",
              color: "var(--ink-1)",
              fontFamily: "inherit",
            }}
          />
          {error && <div className="br-field-error" style={{ marginBlockStart: 8 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBlockStart: 16 }}>
            <button
              type="button"
              onClick={() => onClose(false)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid var(--rule)",
                background: "transparent",
                color: "var(--ink-1)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting || password.length === 0}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid var(--rose, #c45a5a)",
                background: "var(--rose, #c45a5a)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {submitting ? "…" : t("confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
