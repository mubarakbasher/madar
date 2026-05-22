"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { changePasswordRequest } from "@/lib/api/auth";
import { PasswordStrengthMeter } from "../../../../(auth)/_components/PasswordStrengthMeter";

export function ChangePasswordModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("settings.profile.passwordModal");
  const tErr = useTranslations("settings.profile.errors");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; next?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      changePasswordRequest({ current_password: current, new_password: next }),
    onSuccess,
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setFieldErrors({ current: tErr("invalid_credentials") });
          return;
        }
        if (err.code === "weak_password") {
          setFieldErrors({ next: tErr("weak_password") });
          return;
        }
        if (err.code === "same_password") {
          setFieldErrors({ next: tErr("same_password") });
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
    if (next !== confirm) {
      setFieldErrors({ next: t("mismatch") });
      return;
    }
    mut.mutate();
  };

  return (
    <div className="prof-modal-bg" role="dialog" aria-modal onClick={onClose}>
      <form className="prof-modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h3>{t("title")}</h3>
        {generalError && <div className="prof-error">{generalError}</div>}

        <div className="prof-field">
          <label className="prof-label" htmlFor="cpw-current">
            {t("current")}
          </label>
          <input
            id="cpw-current"
            className="prof-input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
            required
          />
          {fieldErrors.current && (
            <div className="prof-field-error">{fieldErrors.current}</div>
          )}
        </div>

        <div className="prof-field">
          <label className="prof-label" htmlFor="cpw-new">
            {t("new")}
          </label>
          <input
            id="cpw-new"
            className="prof-input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <PasswordStrengthMeter password={next} />
          {fieldErrors.next && (
            <div className="prof-field-error">{fieldErrors.next}</div>
          )}
        </div>

        <div className="prof-field">
          <label className="prof-label" htmlFor="cpw-confirm">
            {t("confirm")}
          </label>
          <input
            id="cpw-confirm"
            className="prof-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
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
            disabled={
              mut.isPending || !current || !next || !confirm
            }
          >
            {mut.isPending ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
