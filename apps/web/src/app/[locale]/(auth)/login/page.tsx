"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams, useRouter as useNextRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useRouter } from "../../../../../i18n/routing";
import {
  isMfaPending,
  loginRequest,
  mfaVerifyRequest,
} from "../../../../lib/api/auth";
import { ApiError } from "../../../../lib/api/client";
import { useAuthStore } from "../../../../lib/auth/store";
import { LoginSchema, type LoginInput } from "../../../../lib/validation/auth-schemas";
import { MfaChallenge } from "../_components/MfaChallenge";

type Step = "creds" | "mfa";

export default function LoginPage() {
  // `LoginForm` calls `useSearchParams()` to honor `?returnTo=`, which forces
  // a Suspense boundary at SSG/prerender time per Next.js's CSR-bailout rules.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("auth.login");
  const tc = useTranslations("auth.common");
  const tMfa = useTranslations("auth.mfa.challenge");
  const locale = useLocale();
  const router = useRouter();
  const nextRouter = useNextRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  /**
   * Pick a safe post-login destination. `returnTo` only wins if it's a
   * same-origin relative path that already includes the locale prefix
   * (since the redirect-on-cleared watcher writes `/{locale}/whatever`).
   * Rejects anything like `//evil.com/x`, `http://…`, or paths with no leading
   * slash to block open-redirect attacks.
   */
  function postLoginDestination(): { kind: "next"; path: string } | { kind: "intl"; path: string } {
    const raw = searchParams.get("returnTo");
    // `/\evil.com` normalizes to protocol-relative `//evil.com` in browsers,
    // so backslashes are rejected along with `//` and absolute URLs.
    if (
      raw &&
      raw.startsWith("/") &&
      !raw.startsWith("//") &&
      !raw.includes("\\") &&
      !raw.includes(":")
    ) {
      // returnTo already includes the locale prefix — go via plain router so
      // next-intl doesn't re-prefix it.
      return { kind: "next", path: raw };
    }
    return { kind: "intl", path: "/" };
  }

  function goPostLogin(): void {
    const dest = postLoginDestination();
    if (dest.kind === "next") {
      nextRouter.replace(dest.path);
    } else {
      router.replace(dest.path, { locale });
    }
  }
  const [showPw, setShowPw] = useState(false);
  const [step, setStep] = useState<Step>("creds");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>("");
  const [mfaError, setMfaError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const mutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (response, vars) => {
      if (isMfaPending(response)) {
        setPendingToken(response.mfa_pending_token);
        setPendingEmail(vars.email);
        setStep("mfa");
        return;
      }
      setAuth({
        accessToken: response.access_token,
        user: response.user,
        tenant: response.tenant,
      });
      goPostLogin();
    },
  });

  const mfaMutation = useMutation({
    mutationFn: (code: string) => {
      if (!pendingToken) throw new Error("missing pending token");
      return mfaVerifyRequest({ mfa_pending_token: pendingToken, code });
    },
    onSuccess: (session) => {
      setAuth({
        accessToken: session.access_token,
        user: session.user,
        tenant: session.tenant,
      });
      goPostLogin();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === "mfa_pending_invalid") {
          // Session expired — bounce back to the credentials step.
          setStep("creds");
          setPendingToken(null);
          setMfaError(safeT(tMfa, "errors.mfa_pending_invalid", err.message));
          return;
        }
        setMfaError(safeT(tMfa, `errors.${err.code}`, err.message));
      } else {
        setMfaError(safeT(tMfa, "errors.network", "Network error"));
      }
    },
  });

  if (step === "mfa") {
    return (
      <MfaChallenge
        signedInAs={pendingEmail}
        submitting={mfaMutation.isPending}
        error={mfaError}
        onSubmit={(code) => {
          setMfaError(null);
          mfaMutation.mutate(code);
        }}
        onBack={() => {
          setStep("creds");
          setPendingToken(null);
          setMfaError(null);
        }}
      />
    );
  }

  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const errorMessage = apiError
    ? safeT(t, `errors.${apiError.code}`, t("errors.network"))
    : null;

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
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
      >
        <FieldShell
          label={t("emailLabel")}
          error={errors.email ? safeT(tc, errors.email.message, errors.email.message ?? "") : null}
        >
          <input
            type="email"
            autoComplete="email"
            autoFocus
            className="w-full bg-transparent outline-none"
            style={inputStyle()}
            {...register("email")}
          />
        </FieldShell>

        <FieldShell
          label={t("passwordLabel")}
          rightLink={
            <Link
              href="/forgot-password"
              className="underline underline-offset-4"
              style={{ color: "var(--accent)", fontSize: 12 }}
            >
              {t("forgot")}
            </Link>
          }
          error={
            errors.password
              ? safeT(tc, errors.password.message, errors.password.message ?? "")
              : null
          }
        >
          <div className="relative w-full">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              className="w-full bg-transparent pe-10 outline-none"
              style={inputStyle()}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? tc("hide") : tc("show")}
              className="absolute inset-y-0 end-2 my-auto inline-flex h-8 w-8 items-center justify-center rounded-md"
              style={{ color: "var(--ink-3)" }}
            >
              {showPw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </button>
          </div>
        </FieldShell>

        <label className="mt-1 inline-flex items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
          <input type="checkbox" {...register("remember")} />
          {t("remember")}
        </label>

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
          disabled={isSubmitting || mutation.isPending}
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

      <p className="mt-7 text-sm" style={{ color: "var(--ink-3)" }}>
        {t("signupPrompt")}{" "}
        <Link
          href="/signup"
          className="underline underline-offset-4"
          style={{ color: "var(--accent)" }}
        >
          {t("signupCta")}
        </Link>
      </p>
    </div>
  );
}

function FieldShell({
  label,
  rightLink,
  error,
  children,
}: {
  label: string;
  rightLink?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]" style={{ color: "var(--ink-3)" }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {rightLink}
      </div>
      <div
        className="flex w-full items-center rounded-xl border px-3 py-2.5"
        style={{
          borderColor: error ? "var(--rose)" : "var(--rule)",
          background: "var(--bg)",
        }}
      >
        {children}
      </div>
      {error && (
        <div className="mt-1 text-[12px]" style={{ color: "var(--rose)" }}>
          {error}
        </div>
      )}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    fontSize: 14,
    color: "var(--ink)",
    fontFamily: "inherit",
  };
}

/** Translate a key that may be a literal string already (for client-side zod messages). */
function safeT(t: ReturnType<typeof useTranslations>, key: string | undefined, fallback: string): string {
  if (!key) return fallback;
  try {
    const v = t(key);
    if (v === key || v.endsWith("." + key) || v.endsWith(key)) return fallback;
    return v;
  } catch {
    return fallback;
  }
}
