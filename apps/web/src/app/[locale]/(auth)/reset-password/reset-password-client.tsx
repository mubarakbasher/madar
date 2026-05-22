"use client";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "../../../../../i18n/routing";
import { resetPasswordRequest } from "../../../../lib/api/auth";
import { ApiError } from "../../../../lib/api/client";
import { PasswordStrengthMeter } from "../_components/PasswordStrengthMeter";

export function ResetPasswordClient({ token }: { token: string }) {
  const t = useTranslations("auth.reset");
  const tc = useTranslations("auth.common");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);

  const mutation = useMutation({
    mutationFn: () => resetPasswordRequest({ token, new_password: password }),
  });

  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const errorKey = apiError ? `errors.${apiError.code}` : null;
  const errorMessage = errorKey ? safeT(t, errorKey, t("errors.network")) : null;

  if (mutation.isSuccess) {
    return (
      <div>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 32,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {t("successTitle")}
        </h1>
        <p className="mt-2" style={{ color: "var(--ink-3)", fontSize: 14 }}>
          {t("successBody")}
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 32 }}>{t("title")}</h1>
        <div
          role="alert"
          className="mt-7 rounded-xl border p-5"
          style={{ borderColor: "var(--rose)", color: "var(--rose)" }}
        >
          {safeT(t, "errors.invalid_token", "This reset link is invalid.")}
          <div className="mt-3">
            <Link
              href="/forgot-password"
              className="text-sm underline underline-offset-4"
              style={{ color: "var(--accent)" }}
            >
              {t("requestNew")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--serif)",
          fontSize: 32,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
        }}
      >
        {t("title")}
      </h1>
      <p className="mt-2" style={{ color: "var(--ink-3)", fontSize: 14 }}>
        {t("subtitle")}
      </p>

      <form
        className="mt-7 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (mismatch) return;
          mutation.mutate();
        }}
        noValidate
      >
        <PasswordField
          label={t("newPasswordLabel")}
          value={password}
          onChange={setPassword}
          show={showPw}
          onToggle={() => setShowPw((v) => !v)}
          tc={tc}
        />
        <PasswordStrengthMeter password={password} />
        <PasswordField
          label={t("confirmLabel")}
          value={confirm}
          onChange={setConfirm}
          show={showPw}
          onToggle={() => setShowPw((v) => !v)}
          tc={tc}
          error={mismatch ? t("mismatch") : null}
        />

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: "color-mix(in oklab, var(--rose) 14%, transparent)",
              color: "var(--rose)",
              border: "1px solid color-mix(in oklab, var(--rose) 24%, transparent)",
            }}
          >
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending || password.length < 8 || mismatch}
          className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium transition disabled:opacity-60"
          style={{
            background: "var(--accent)",
            color: "white",
            boxShadow: "0 6px 24px -14px color-mix(in oklab, var(--accent) 70%, transparent)",
          }}
        >
          {mutation.isPending ? t("submitting") : t("submit")}
          <ArrowRight size={16} strokeWidth={1.5} className="rtl:rotate-180" />
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  tc,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  tc: ReturnType<typeof useTranslations>;
  error?: string | null;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[12px]" style={{ color: "var(--ink-3)", fontWeight: 500 }}>
        {label}
      </div>
      <div
        className="flex w-full items-center rounded-xl border px-3 py-2.5"
        style={{
          borderColor: error ? "var(--rose)" : "var(--rule)",
          background: "var(--bg)",
        }}
      >
        <div className="relative w-full">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            className="w-full bg-transparent pe-10 outline-none"
            style={{ fontSize: 14, color: "var(--ink)", fontFamily: "inherit" }}
            required
          />
          <button
            type="button"
            onClick={onToggle}
            aria-label={show ? tc("hide") : tc("show")}
            className="absolute inset-y-0 end-2 my-auto inline-flex h-8 w-8 items-center justify-center rounded-md"
            style={{ color: "var(--ink-3)" }}
          >
            {show ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-1 text-[12px]" style={{ color: "var(--rose)" }}>
          {error}
        </div>
      )}
    </label>
  );
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
