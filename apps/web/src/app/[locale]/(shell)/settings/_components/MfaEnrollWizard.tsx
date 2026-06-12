"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, X } from "lucide-react";
import {
  mfaEnrollStartRequest,
  mfaEnrollVerifyRequest,
  type MfaEnrollStartResponse,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

type Step = "scan" | "verify" | "codes";

export function MfaEnrollWizard({
  onClose,
  accountLabel,
}: {
  onClose: (saved: boolean) => void;
  accountLabel: string;
}) {
  const t = useTranslations("auth.mfa.enroll");
  const tCh = useTranslations("auth.mfa.challenge");
  const tCommon = useTranslations("common");
  const [step, setStep] = useState<Step>("scan");
  const [start, setStart] = useState<MfaEnrollStartResponse | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  void accountLabel;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await mfaEnrollStartRequest();
        if (!cancelled) setStart(r);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) setStartError(err.message);
        else setStartError(t("errors.network"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function onVerify(): Promise<void> {
    setVerifyError(null);
    setSubmitting(true);
    try {
      const r = await mfaEnrollVerifyRequest({ code });
      setCodes(r.recovery_codes);
      setStep("codes");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "mfa_invalid") {
          setVerifyError(tCh("errors.mfa_invalid"));
        } else if (err.code === "enroll_expired") {
          setVerifyError(safeT(t, "errors.enroll_expired", err.message));
        } else {
          setVerifyError(err.message);
        }
      } else {
        setVerifyError(t("errors.network"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function copyAll(): void {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(codes.join("\n"));
    }
  }

  function download(): void {
    const blob = new Blob([codes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "madar-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ModalShell onClose={() => onClose(step === "codes" && confirmedSaved)}>
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
          onClick={() => onClose(step === "codes" && confirmedSaved)}
          aria-label={tCommon("close")}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-2)" }}
        >
          <X size={16} />
        </button>
      </header>

      <div style={{ padding: 18 }}>
        {step === "scan" && (
          <>
            <h3 style={{ fontSize: 14, fontWeight: 500, marginBlockEnd: 6 }}>{t("step1Title")}</h3>
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("step1Body")}</p>
            {startError && <div className="br-field-error" style={{ marginBlockStart: "var(--space-2)" }}>{startError}</div>}
            {start && (
              <div style={{ marginBlockStart: 14, textAlign: "center" }}>
                <div
                  style={{
                    display: "inline-block",
                    padding: "var(--space-3)",
                    background: "white",
                    borderRadius: 12,
                  }}
                >
                  <QRCodeSVG value={start.provisioning_uri} size={180} />
                </div>
                <div style={{ marginBlockStart: 10, fontSize: 11, color: "var(--ink-3)" }}>
                  {t("manualKey")}
                </div>
                <code
                  style={{
                    display: "inline-block",
                    marginBlockStart: "var(--space-1)",
                    padding: "var(--space-1) 10px",
                    background: "var(--bg)",
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-mono, ui-monospace, monospace)",
                    fontSize: 12,
                  }}
                >
                  {start.secret_b32}
                </code>
              </div>
            )}
            <div style={{ marginBlockStart: 18, display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <button
                type="button"
                disabled={!start}
                onClick={() => setStep("verify")}
                style={btn("primary")}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {step === "verify" && (
          <>
            <h3 style={{ fontSize: 14, fontWeight: 500, marginBlockEnd: 6 }}>{t("step2Title")}</h3>
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("step2Body")}</p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              style={{
                marginBlockStart: "var(--space-3)",
                width: 160,
                padding: "10px var(--space-3)",
                fontSize: 22,
                letterSpacing: 4,
                textAlign: "center",
                fontFamily: "var(--serif, Fraunces, serif)",
                border: "1px solid var(--rule)",
                background: "var(--bg)",
                color: "var(--ink-1)",
                borderRadius: 8,
              }}
            />
            {verifyError && (
              <div className="br-field-error" style={{ marginBlockStart: "var(--space-2)" }}>{verifyError}</div>
            )}
            <div style={{ marginBlockStart: 18, display: "flex", justifyContent: "space-between" }}>
              <button type="button" onClick={() => setStep("scan")} style={btn("ghost")}>
                ← Back
              </button>
              <button
                type="button"
                disabled={code.length < 6 || submitting}
                onClick={onVerify}
                style={btn("primary")}
              >
                {submitting ? "…" : "Verify"}
              </button>
            </div>
          </>
        )}

        {step === "codes" && (
          <>
            <h3 style={{ fontSize: 14, fontWeight: 500, marginBlockEnd: 6 }}>{t("step3Title")}</h3>
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("step3Body")}</p>

            <div
              style={{
                marginBlockStart: "var(--space-3)",
                padding: "var(--space-3)",
                background: "var(--bg)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                fontSize: 13,
              }}
            >
              {codes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>

            <div style={{ marginBlockStart: "var(--space-3)", display: "flex", gap: "var(--space-2)" }}>
              <button type="button" onClick={copyAll} style={btn("ghost")}>
                <Copy size={12} strokeWidth={1.5} /> {t("copyAll")}
              </button>
              <button type="button" onClick={download} style={btn("ghost")}>
                <Download size={12} strokeWidth={1.5} /> {t("download")}
              </button>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBlockStart: "var(--space-4)",
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              <input
                type="checkbox"
                checked={confirmedSaved}
                onChange={(e) => setConfirmedSaved(e.target.checked)}
              />
              {t("confirmSaved")}
            </label>

            <div style={{ marginBlockStart: 18, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={!confirmedSaved}
                onClick={() => onClose(true)}
                style={btn("primary")}
              >
                {t("close")}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
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
          boxShadow: "0 24px 80px -24px rgba(0,0,0,0.35)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function btn(variant: "primary" | "ghost"): React.CSSProperties {
  const primary = variant === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "var(--space-2) 14px",
    borderRadius: 8,
    fontSize: 13,
    border: primary ? "1px solid var(--accent)" : "1px solid var(--rule)",
    background: primary ? "var(--accent)" : "transparent",
    color: primary ? "white" : "var(--ink-1)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function safeT(t: ReturnType<typeof useTranslations>, key: string, fallback: string): string {
  try {
    const v = t(key);
    if (v === key || v.endsWith("." + key) || v.endsWith(key)) return fallback;
    return v;
  } catch {
    return fallback;
  }
}
