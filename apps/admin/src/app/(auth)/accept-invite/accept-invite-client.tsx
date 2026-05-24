"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { adminAcceptInvite } from "@/lib/api/admin-team";
import { ApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n";

export function AcceptInviteClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl text-ink tracking-tight">{t("auth.acceptInvite.invalidTitle")}</h1>
        <p className="font-sans text-sm text-ink-3">
          {t("auth.acceptInvite.invalidBody")}
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={24} strokeWidth={1.5} className="text-accent" />
          <h1 className="font-serif text-3xl text-ink tracking-tight">{t("auth.acceptInvite.successTitle")}</h1>
        </div>
        <p className="font-sans text-sm text-ink-3">
          {t("auth.acceptInvite.successBody")}
        </p>
        <button
          type="button"
          className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm font-medium text-white shadow-sm hover:opacity-90 transition"
          onClick={() => router.push("/login")}
        >
          {t("auth.acceptInvite.goToSignIn")}
        </button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError(t("auth.acceptInvite.errors.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.acceptInvite.errors.mismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await adminAcceptInvite({ token, password });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invite_invalid") {
          setError(t("auth.acceptInvite.errors.inviteInvalid"));
        } else {
          setError(err.message || t("auth.acceptInvite.errors.unknown"));
        }
      } else {
        setError(t("auth.acceptInvite.errors.network"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-ink tracking-tight">
          {t("auth.acceptInvite.heading")}
        </h1>
        <p className="font-sans text-sm text-ink-3">
          {t("auth.acceptInvite.subtitle")}
        </p>
      </header>

      <div className="space-y-1.5">
        <label htmlFor="new-password" className="block font-sans text-xs font-medium text-ink-2">
          {t("auth.acceptInvite.passwordLabel")}
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            autoFocus
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.acceptInvite.passwordPlaceholder")}
            className="w-full rounded-md border border-rule bg-bg-elev px-3 py-2.5 pe-10 font-sans text-sm text-ink placeholder:text-ink-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("auth.acceptInvite.hidePassword") : t("auth.acceptInvite.showPassword")}
            className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-4 hover:text-ink-2 transition"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="block font-sans text-xs font-medium text-ink-2">
          {t("auth.acceptInvite.confirmLabel")}
        </label>
        <input
          id="confirm-password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("auth.acceptInvite.confirmPlaceholder")}
          className="w-full rounded-md border border-rule bg-bg-elev px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-rose/30 bg-rose-soft px-3 py-2.5 font-sans text-xs text-ink"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm font-medium text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
      >
        {submitting ? t("auth.acceptInvite.submitting") : t("auth.acceptInvite.submit")}
      </button>

      <p className="font-sans text-[11px] text-ink-4 text-center">
        {t("auth.acceptInvite.mfaNote")}
      </p>
    </form>
  );
}
