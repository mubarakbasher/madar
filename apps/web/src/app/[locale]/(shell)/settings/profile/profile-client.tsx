"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import {
  meRequest,
  updateProfileRequest,
  resendVerificationRequest,
} from "@/lib/api/auth";
import { ChangePasswordModal } from "./_components/ChangePasswordModal";
import { ChangeEmailModal } from "./_components/ChangeEmailModal";

async function refreshMe(): Promise<void> {
  try {
    const me = await meRequest();
    useAuthStore.setState((s) => ({ ...s, user: me.user, tenant: me.tenant }));
  } catch {
    /* ignore */
  }
}

export function ProfileClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("settings.profile");
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [nameDraft, setNameDraft] = useState(user?.name ?? "");
  const [savedName, setSavedName] = useState(false);
  const [savedLocale, setSavedLocale] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [resendOk, setResendOk] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [emailModal, setEmailModal] = useState(false);

  const updateMut = useMutation({
    mutationFn: (body: { name?: string; locale?: "en" | "ar" }) =>
      updateProfileRequest(body),
    onSuccess: (data, variables) => {
      useAuthStore.setState((s) => ({
        ...s,
        user: data.user,
        tenant: data.tenant,
      }));
      qc.invalidateQueries({ queryKey: ["auth", "me"] }).catch(() => {});
      if (variables.name !== undefined) {
        setSavedName(true);
        setTimeout(() => setSavedName(false), 1500);
      }
      if (variables.locale !== undefined) {
        setSavedLocale(true);
        setTimeout(() => setSavedLocale(false), 1500);
        // Hard navigate to swap the locale prefix on the URL.
        const next = variables.locale;
        if (typeof window !== "undefined" && next !== locale) {
          const path = window.location.pathname.replace(/^\/(en|ar)/, `/${next}`);
          window.location.assign(path);
        }
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setNameError(err.message);
      } else {
        setNameError(t("errors.network"));
      }
    },
  });

  const resendMut = useMutation({
    mutationFn: () =>
      resendVerificationRequest({ email: user?.email ?? "", locale }),
    onSuccess: () => {
      setResendOk(true);
      setTimeout(() => setResendOk(false), 2500);
    },
  });

  if (!user) return null;

  const initial = (user.name || user.email).slice(0, 1).toUpperCase();
  const isVerified = user.email_verified;

  const onSaveName = () => {
    setNameError(null);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === user.name) return;
    updateMut.mutate({ name: trimmed });
  };

  const onPickLocale = (l: "en" | "ar") => {
    if (l === user.locale) return;
    updateMut.mutate({ locale: l });
  };

  return (
    <div className="prof-shell">
      <header className="prof-header">
        <div className="prof-kicker">{t("kicker")}</div>
        <h1 className="prof-title">{t("title")}</h1>
        <p className="prof-subtitle">{t("subtitle")}</p>
      </header>

      {/* Identity card */}
      <section className="prof-card">
        <h2 className="prof-card-title">{t("identity.title")}</h2>
        <div className="prof-identity-grid">
          <div className="prof-avatar" aria-hidden>
            {initial}
          </div>
          <div>
            <div className="prof-field">
              <label className="prof-label" htmlFor="prof-name">
                {t("identity.name")}
              </label>
              <div className="prof-input-row">
                <input
                  id="prof-name"
                  className="prof-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={120}
                />
                <button
                  type="button"
                  className="prof-btn prof-btn-primary"
                  disabled={
                    updateMut.isPending ||
                    !nameDraft.trim() ||
                    nameDraft.trim() === user.name
                  }
                  onClick={onSaveName}
                >
                  {updateMut.isPending && updateMut.variables?.name !== undefined
                    ? t("identity.saving")
                    : t("identity.save")}
                </button>
              </div>
              {savedName && (
                <div className="prof-saved">
                  <CheckCircle2
                    size={12}
                    strokeWidth={1.5}
                    style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }}
                  />
                  {t("identity.saved")}
                </div>
              )}
              {nameError && <div className="prof-field-error">{nameError}</div>}
            </div>

            <div className="prof-field">
              <label className="prof-label">{t("identity.email")}</label>
              <div className="prof-input-row">
                <div className="prof-readonly">{user.email}</div>
                <span
                  className={`prof-pill ${
                    isVerified ? "prof-pill-sage" : "prof-pill-amber"
                  }`}
                >
                  {isVerified
                    ? t("identity.emailVerified")
                    : t("identity.emailPending")}
                </span>
                <button
                  type="button"
                  className="prof-btn"
                  onClick={() => setEmailModal(true)}
                >
                  {t("changeEmail")}
                </button>
              </div>
              {!isVerified && (
                <div>
                  <button
                    type="button"
                    className="prof-btn"
                    style={{ marginBlockStart: "var(--space-2)" }}
                    disabled={resendMut.isPending}
                    onClick={() => resendMut.mutate()}
                  >
                    {t("identity.resendVerify")}
                  </button>
                  {resendOk && (
                    <span className="prof-saved" style={{ marginInlineStart: 10 }}>
                      {t("identity.resendSent")}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="prof-field">
              <label className="prof-label">{t("identity.locale")}</label>
              <div className="prof-radio-row">
                {(["en", "ar"] as const).map((l) => (
                  <label
                    key={l}
                    className={`prof-radio ${
                      user.locale === l ? "prof-radio-active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="profile-locale"
                      checked={user.locale === l}
                      onChange={() => onPickLocale(l)}
                    />
                    {t(`identity.locale${l === "en" ? "En" : "Ar"}`)}
                  </label>
                ))}
                {savedLocale && (
                  <span
                    className="prof-saved"
                    style={{ alignSelf: "center", marginInlineStart: "var(--space-2)" }}
                  >
                    {t("identity.saved")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Password card */}
      <section className="prof-card">
        <h2 className="prof-card-title">{t("password.title")}</h2>
        <p className="prof-card-sub">{t("password.subtitle")}</p>
        <button
          type="button"
          className="prof-btn prof-btn-primary"
          onClick={() => setPwModal(true)}
        >
          {t("password.cta")}
        </button>
      </section>

      {/* Security card — read-only summary, links to /settings/security */}
      <section className="prof-card">
        <h2 className="prof-card-title">{t("security.title")}</h2>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBlockEnd: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius)",
              background: user.mfa_enabled
                ? "color-mix(in oklab, var(--sage, #6e9b7f) 16%, transparent)"
                : "color-mix(in oklab, var(--ink-3) 12%, transparent)",
              color: user.mfa_enabled ? "var(--sage, #4d7359)" : "var(--ink-2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            {user.mfa_enabled ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
          </div>
          <div style={{ fontSize: 13 }}>
            {user.mfa_enabled ? t("security.enabled") : t("security.disabled")}
          </div>
        </div>
        <a className="prof-btn" href={`/${locale}/settings/security`}>
          {t("security.manage")}
        </a>
      </section>

      {/* Notifications placeholder */}
      <section className="prof-card" style={{ opacity: 0.7 }}>
        <h2 className="prof-card-title">{t("notifications.title")}</h2>
        <p className="prof-card-sub">{t("notifications.soon")}</p>
      </section>

      {pwModal && (
        <ChangePasswordModal
          onClose={() => setPwModal(false)}
          onSuccess={() => {
            setPwModal(false);
            useAuthStore.getState().clearAuth();
            // Land on the auth realm; refresh cookie was already cleared server-side.
            window.location.assign(`/${locale}/login`);
          }}
        />
      )}

      {emailModal && (
        <ChangeEmailModal
          locale={locale}
          onClose={() => setEmailModal(false)}
          onSuccess={async () => {
            setEmailModal(false);
            await refreshMe();
          }}
        />
      )}
    </div>
  );
}
