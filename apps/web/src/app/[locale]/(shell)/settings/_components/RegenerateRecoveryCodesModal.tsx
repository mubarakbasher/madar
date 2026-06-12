"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, X } from "lucide-react";
import { mfaRegenerateRecoveryCodesRequest } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

type Stage = "password" | "codes";

export function RegenerateRecoveryCodesModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("auth.mfa.regenerate");
  const tCommon = useTranslations("common");
  const [stage, setStage] = useState<Stage>("password");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const res = await mfaRegenerateRecoveryCodesRequest({ password });
      setCodes(res.recovery_codes);
      setStage("codes");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") setError(t("errors.wrongPassword"));
        else if (err.code === "mfa_not_enabled") setError(t("errors.notEnabled"));
        else setError(err.message);
      } else {
        setError(t("errors.network"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function copyAll(): Promise<void> {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — codes are still visible on screen */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 60,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          background: "var(--bg-elev)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-lg)",
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
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--ink-2)",
            }}
            aria-label={tCommon("close")}
          >
            <X size={16} />
          </button>
        </header>
        <div style={{ padding: 18 }}>
          {stage === "password" && (
            <>
              <p style={{ fontSize: 13, color: "var(--ink-3)", marginBlockEnd: "var(--space-3)" }}>
                {t("body")}
              </p>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--ink-2)",
                  marginBlockEnd: "var(--space-1)",
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
                  padding: "var(--space-2) 10px",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  fontSize: 13,
                  background: "var(--bg)",
                  color: "var(--ink-1)",
                  fontFamily: "inherit",
                }}
              />
              {error && (
                <div className="br-field-error" style={{ marginBlockStart: "var(--space-2)" }}>
                  {error}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "var(--space-2)",
                  marginBlockStart: "var(--space-4)",
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  style={{
                    padding: "var(--space-2) 14px",
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
                    padding: "var(--space-2) 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    border: "1px solid var(--accent)",
                    background: "var(--accent)",
                    color: "white",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {submitting ? "…" : t("confirm")}
                </button>
              </div>
            </>
          )}

          {stage === "codes" && (
            <>
              <p style={{ fontSize: 13, color: "var(--ink-3)", marginBlockEnd: "var(--space-3)" }}>
                {t("codesIntro")}
              </p>
              <ul
                style={{
                  fontFamily: "var(--mono, ui-monospace, SFMono-Regular, monospace)",
                  fontSize: 14,
                  background: "var(--bg)",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  padding: "var(--space-3) var(--space-4)",
                  listStyle: "none",
                  margin: 0,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px var(--space-4)",
                }}
              >
                {codes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <p style={{ fontSize: 12, color: "var(--rose, #c45a5a)", marginBlockStart: 10 }}>
                {t("codesWarning")}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBlockStart: "var(--space-4)",
                }}
              >
                <button
                  type="button"
                  onClick={copyAll}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    color: "var(--ink-1)",
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? t("copied") : t("copyAll")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "var(--space-2) 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    border: "1px solid var(--accent)",
                    background: "var(--accent)",
                    color: "white",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t("done")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
