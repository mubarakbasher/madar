"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { adminLogin, adminMfaVerify } from "../../../lib/api/admin-auth";
import { ApiError } from "../../../lib/api/client";
import { useAdminAuthStore } from "../../../lib/auth/store";
import { AdminLoginSchema, type AdminLoginInput } from "../../../lib/validation/admin-auth-schemas";
import { t } from "../../../lib/i18n";

type Step = "creds" | "mfa";

export function LoginClient() {
  const router = useRouter();
  const setAuth = useAdminAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>("creds");
  const [mfaPendingToken, setMfaPendingToken] = useState<string | null>(null);
  const [signedInAs, setSignedInAs] = useState<string>("");
  const [credsError, setCredsError] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submittingCreds, setSubmittingCreds] = useState(false);
  const [submittingMfa, setSubmittingMfa] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(AdminLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onCredsSubmit(values: AdminLoginInput) {
    setCredsError(null);
    setSubmittingCreds(true);
    try {
      const res = await adminLogin(values);
      setMfaPendingToken(res.mfa_pending_token);
      setSignedInAs(values.email);
      setStep("mfa");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setCredsError(t("auth.login.errors.invalidCredentials"));
        else if (err.status === 403 && err.code === "mfa_not_enrolled")
          setCredsError(t("auth.login.errors.mfaNotEnrolled"));
        else if (err.status === 429) setCredsError(t("auth.login.errors.rateLimited"));
        else setCredsError(t("auth.login.errors.unknown"));
      } else {
        setCredsError(t("auth.login.errors.network"));
      }
    } finally {
      setSubmittingCreds(false);
    }
  }

  async function handleMfaSubmit(code: string) {
    if (!mfaPendingToken) return;
    setMfaError(null);
    setSubmittingMfa(true);
    try {
      const res = await adminMfaVerify(code, mfaPendingToken);
      setAuth({ accessToken: res.access_token, user: res.platform_user });
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "mfa_invalid") setMfaError(t("auth.mfa.errors.invalid"));
        else if (err.code === "mfa_pending_invalid" || err.code === "mfa_pending_missing") {
          setMfaError(t("auth.mfa.errors.pendingInvalid"));
          setTimeout(() => {
            setStep("creds");
            setMfaPendingToken(null);
          }, 1500);
        } else if (err.status === 429) setMfaError(t("auth.mfa.errors.rateLimited"));
        else setMfaError(t("auth.mfa.errors.unknown"));
      } else {
        setMfaError(t("auth.login.errors.network"));
      }
    } finally {
      setSubmittingMfa(false);
    }
  }

  function handleBack() {
    setStep("creds");
    setMfaError(null);
    setMfaPendingToken(null);
  }

  return (
    <div>
      {step === "creds" && (
        <CredsStep
          register={register}
          errors={errors}
          showPassword={showPassword}
          onToggleShowPassword={() => setShowPassword((v) => !v)}
          credsError={credsError}
          submitting={submittingCreds}
          onSubmit={handleSubmit(onCredsSubmit)}
        />
      )}
      {step === "mfa" && (
        <MfaStep
          signedInAs={signedInAs}
          mfaError={mfaError}
          submitting={submittingMfa}
          onSubmit={handleMfaSubmit}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

interface CredsStepProps {
  register: ReturnType<typeof useForm<AdminLoginInput>>["register"];
  errors: ReturnType<typeof useForm<AdminLoginInput>>["formState"]["errors"];
  showPassword: boolean;
  onToggleShowPassword: () => void;
  credsError: string | null;
  submitting: boolean;
  onSubmit: () => void;
}

function CredsStep({
  register,
  errors,
  showPassword,
  onToggleShowPassword,
  credsError,
  submitting,
  onSubmit,
}: CredsStepProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-ink tracking-tight">
          {t("auth.login.heading")}
        </h1>
        <p className="font-sans text-sm text-ink-3">{t("auth.login.subtitle")}</p>
      </header>

      <div className="space-y-1.5">
        <label htmlFor="email" className="block font-sans text-xs font-medium text-ink-2">
          {t("auth.login.emailLabel")}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          placeholder={t("auth.login.emailPlaceholder")}
          className="w-full rounded-md border border-rule bg-bg-elev px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
          {...register("email")}
        />
        {errors.email && (
          <p className="font-sans text-xs text-rose">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block font-sans text-xs font-medium text-ink-2">
          {t("auth.login.passwordLabel")}
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder={t("auth.login.passwordPlaceholder")}
            className="w-full rounded-md border border-rule bg-bg-elev px-3 py-2.5 pe-10 font-sans text-sm text-ink placeholder:text-ink-4 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
            {...register("password")}
          />
          <button
            type="button"
            onClick={onToggleShowPassword}
            aria-label={showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
            className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-4 hover:text-ink-2 transition"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
          </button>
        </div>
        {errors.password && (
          <p className="font-sans text-xs text-rose">{errors.password.message}</p>
        )}
      </div>

      {credsError && (
        <div
          role="alert"
          className="rounded-md border border-rose/30 bg-rose-soft px-3 py-2.5 font-sans text-xs text-ink"
        >
          {credsError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm font-medium text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
      >
        {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
      </button>

      <p className="font-sans text-xs text-ink-4 text-center">
        {t("auth.login.footHint")}{" "}
        <span className="text-ink-3">{t("auth.login.footAction")}</span>.
      </p>
    </form>
  );
}

interface MfaStepProps {
  signedInAs: string;
  mfaError: string | null;
  submitting: boolean;
  onSubmit: (code: string) => Promise<void>;
  onBack: () => void;
}

function MfaStep({ signedInAs, mfaError, submitting, onSubmit, onBack }: MfaStepProps) {
  const boxesRef = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);

  useEffect(() => {
    boxesRef.current[0]?.focus();
  }, []);

  const code = digits.join("");
  const isComplete = code.length === 6 && digits.every((d) => /^\d$/.test(d));

  function handleInput(idx: number, raw: string) {
    const ch = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = ch;
    setDigits(next);
    if (ch && idx < 5) boxesRef.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      boxesRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      boxesRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < 5) {
      e.preventDefault();
      boxesRef.current[idx + 1]?.focus();
    } else if (e.key === "Enter" && isComplete) {
      e.preventDefault();
      void onSubmit(code);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]!;
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    boxesRef.current[focusIdx]?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isComplete && !submitting) void onSubmit(code);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-ink tracking-tight">
          {t("auth.mfa.heading")}
        </h1>
        <p className="font-sans text-sm text-ink-3">{t("auth.mfa.subtitle")}</p>
        <p className="font-sans text-xs text-ink-4">
          {t("auth.mfa.signedInAs")}{" "}
          <strong className="font-medium text-ink-2">{signedInAs}</strong>
        </p>
      </header>

      <div className="flex justify-between gap-2" role="group" aria-label="6-digit verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              boxesRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={d}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            className="h-[60px] w-12 rounded-md border border-rule bg-bg-elev text-center font-serif text-[28px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {mfaError && (
        <div
          role="alert"
          className="rounded-md border border-rose/30 bg-rose-soft px-3 py-2.5 font-sans text-xs text-ink"
        >
          {mfaError}
        </div>
      )}

      <button
        type="submit"
        disabled={!isComplete || submitting}
        className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm font-medium text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
      >
        {submitting ? t("auth.mfa.submitting") : t("auth.mfa.submit")}
      </button>

      <div className="flex items-center justify-center gap-3 font-sans text-xs">
        <button
          type="button"
          onClick={onBack}
          className="text-ink-3 hover:text-ink-2 transition"
        >
          {t("auth.mfa.back")}
        </button>
        <span className="text-ink-4">·</span>
        <span
          aria-disabled="true"
          title={t("auth.mfa.recoveryHint")}
          className="cursor-not-allowed text-ink-4"
        >
          {t("auth.mfa.recoveryComingSoon")}
        </span>
      </div>

      <p className="font-sans text-[11px] text-ink-4 text-center">
        {t("auth.mfa.lostAccessPrompt")}{" "}
        <span className="text-ink-3">{t("auth.mfa.lostAccessAction")}</span>.
      </p>
    </form>
  );
}
