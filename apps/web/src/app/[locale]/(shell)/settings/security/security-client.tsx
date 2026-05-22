"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useAuthStore } from "@/lib/auth/store";
import { meRequest } from "@/lib/api/auth";
import { MfaEnrollWizard } from "../_components/MfaEnrollWizard";
import { DisableMfaModal } from "../_components/DisableMfaModal";
import { RegenerateRecoveryCodesModal } from "../_components/RegenerateRecoveryCodesModal";

async function refreshMe(): Promise<void> {
  try {
    const me = await meRequest();
    useAuthStore.setState((s) => ({
      ...s,
      user: me.user,
      tenant: me.tenant,
    }));
  } catch {
    /* ignore */
  }
}

export function SecurityClient({ locale }: { locale: string }) {
  const t = useTranslations("settings.security");
  const user = useAuthStore((s) => s.user);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  void locale;

  if (!user) return null;
  const on = user.mfa_enabled;

  return (
    <div>
      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)" }}>
          {t("kicker")}
        </div>
        <h1
          style={{
            fontFamily: "var(--serif, Fraunces, serif)",
            fontSize: 28,
            margin: "4px 0 0",
            color: "var(--ink-1)",
          }}
        >
          {t("title")}
        </h1>
        <p style={{ marginTop: 6, fontSize: 14, color: "var(--ink-3)" }}>{t("subtitle")}</p>
      </header>

      <section
        style={{
          border: "1px solid var(--rule)",
          background: "var(--bg-elev)",
          borderRadius: 12,
          padding: 18,
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: on
              ? "color-mix(in oklab, var(--sage, #6e9b7f) 16%, transparent)"
              : "color-mix(in oklab, var(--ink-3) 12%, transparent)",
            color: on ? "var(--sage, #4d7359)" : "var(--ink-2)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {on ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, color: "var(--ink-1)" }}>{t("mfaCardTitle")}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--ink-3)" }}>
            {on ? t("mfaOn") : t("mfaOff")}
          </div>
          <div style={{ marginTop: 12 }}>
            {on ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    color: "var(--ink-1)",
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  onClick={() => setShowRegenerate(true)}
                >
                  {t("regenerateButton")}
                </button>
                <button
                  type="button"
                  className="br-btn br-btn-danger"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--rose, #c45a5a)",
                    color: "var(--rose, #c45a5a)",
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  onClick={() => setShowDisable(true)}
                >
                  {t("disableButton")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                style={{
                  background: "var(--accent)",
                  border: "1px solid var(--accent)",
                  color: "white",
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onClick={() => setShowEnroll(true)}
              >
                {t("enableButton")}
              </button>
            )}
          </div>
        </div>
      </section>

      {showEnroll && (
        <MfaEnrollWizard
          onClose={async (saved) => {
            setShowEnroll(false);
            if (saved) await refreshMe();
          }}
          accountLabel={user.email}
        />
      )}
      {showDisable && (
        <DisableMfaModal
          onClose={async (disabled) => {
            setShowDisable(false);
            if (disabled) await refreshMe();
          }}
        />
      )}
      {showRegenerate && (
        <RegenerateRecoveryCodesModal onClose={() => setShowRegenerate(false)} />
      )}
    </div>
  );
}
