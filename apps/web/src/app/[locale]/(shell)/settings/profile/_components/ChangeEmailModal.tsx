"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { changeEmailRequest } from "@/lib/api/auth";

export function ChangeEmailModal({
  locale,
  onClose,
  onSuccess,
}: {
  locale: "en" | "ar";
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  void locale;
  const t = useTranslations("settings.profile.emailModal");
  const tErr = useTranslations("settings.profile.errors");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => changeEmailRequest({ new_email: email.trim(), password }),
    onSuccess,
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setFieldErrors({ password: tErr("invalid_credentials") });
          return;
        }
        if (err.code === "email_taken") {
          setFieldErrors({ email: tErr("email_taken") });
          return;
        }
        if (err.code === "same_email") {
          setFieldErrors({ email: tErr("same_email") });
          return;
        }
        setGeneralError(err.message);
        return;
      }
      setGeneralError(tErr("network"));
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);
    mut.mutate();
  };

  return (
    <div className="prof-modal-bg" role="dialog" aria-modal onClick={onClose}>
      <form className="prof-modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h3>{t("title")}</h3>
        {generalError && <div className="prof-error">{generalError}</div>}

        <div className="prof-field">
          <label className="prof-label" htmlFor="cem-email">
            {t("newEmail")}
          </label>
          <input
            id="cem-email"
            className="prof-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => setEmail(e.target.value.trim().toLowerCase())}
            autoFocus
            required
          />
          {fieldErrors.email && (
            <div className="prof-field-error">{fieldErrors.email}</div>
          )}
        </div>

        <div className="prof-field">
          <label className="prof-label" htmlFor="cem-password">
            {t("password")}
          </label>
          <input
            id="cem-password"
            className="prof-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {fieldErrors.password && (
            <div className="prof-field-error">{fieldErrors.password}</div>
          )}
        </div>

        <div className="prof-modal-actions">
          <button
            type="button"
            className="prof-btn"
            onClick={onClose}
            disabled={mut.isPending}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="prof-btn prof-btn-primary"
            disabled={mut.isPending || !email.trim() || !password}
          >
            {mut.isPending ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
