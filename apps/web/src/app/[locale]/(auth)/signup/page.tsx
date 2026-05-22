"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useRouter } from "../../../../../i18n/routing";
import { signupRequest, slugAvailableRequest } from "../../../../lib/api/auth";
import { ApiError } from "../../../../lib/api/client";
import { useAuthStore } from "../../../../lib/auth/store";
import { useDebouncedValue } from "../../../../lib/hooks/use-debounced-value";
import { SignupSchema, type SignupInput } from "../../../../lib/validation/auth-schemas";
import { PasswordStrengthMeter } from "../_components/PasswordStrengthMeter";

const COUNTRIES = ["EG", "SD", "SA", "AE", "KW", "JO", "QA", "BH", "OM", "US", "GB"] as const;
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  EG: "EGP", SD: "SDG", SA: "SAR", AE: "AED", KW: "KWD", JO: "JOD",
  QA: "QAR", BH: "BHD", OM: "OMR", US: "USD", GB: "GBP",
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function SignupPage() {
  const t = useTranslations("auth.signup");
  const tc = useTranslations("auth.common");
  const locale = useLocale();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    defaultValues: {
      business_name: "",
      slug: "",
      owner_name: "",
      email: "",
      password: "",
      country_code: "EG",
      default_currency_code: "EGP",
      default_locale: locale === "ar" ? "ar" : "en",
    },
  });

  const slug = watch("slug");
  const country = watch("country_code");
  const password = watch("password");
  const debouncedSlug = useDebouncedValue(slug, 300);
  const slugFormatValid = SLUG_RE.test(debouncedSlug) && debouncedSlug.length >= 3;

  const slugQ = useQuery({
    queryKey: ["slug-available", debouncedSlug],
    queryFn: () => slugAvailableRequest(debouncedSlug),
    enabled: slugFormatValid,
    staleTime: 10_000,
  });

  // Mirror country -> currency unless user has manually changed it
  function onCountryChange(code: string) {
    setValue("country_code", code);
    const curr = CURRENCY_BY_COUNTRY[code];
    if (curr) setValue("default_currency_code", curr);
  }

  const mutation = useMutation({
    mutationFn: signupRequest,
    onSuccess: (session) => {
      setAuth({
        accessToken: session.access_token,
        user: session.user,
        tenant: session.tenant,
      });
      router.replace("/", { locale });
    },
  });

  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const errorMessage = apiError
    ? safeT(t, `errors.${apiError.code}`, t("errors.network"))
    : null;

  let slugStatus: { tone: "muted" | "ok" | "bad"; label: string } | null = null;
  if (slug.length > 0) {
    if (!slugFormatValid) {
      slugStatus = { tone: "bad", label: t("slugInvalid") };
    } else if (slugQ.isFetching) {
      slugStatus = { tone: "muted", label: t("slugChecking") };
    } else if (slugQ.data) {
      slugStatus = slugQ.data.available
        ? { tone: "ok", label: t("slugFree") }
        : { tone: "bad", label: t(slugQ.data.reason === "reserved" ? "slugReserved" : "slugTaken") };
    }
  }

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
        <Field label={t("businessNameLabel")} error={fieldError(errors.business_name?.message, tc)}>
          <input className="w-full bg-transparent outline-none" style={inputStyle()} autoFocus {...register("business_name")} />
        </Field>

        <Field
          label={t("slugLabel")}
          error={fieldError(errors.slug?.message, tc)}
          hint={
            slugStatus && (
              <SlugBadge tone={slugStatus.tone}>
                {slugStatus.tone === "muted" && <Loader2 size={12} className="animate-spin" />}
                {slugStatus.tone === "ok" && <Check size={12} strokeWidth={2} />}
                {slugStatus.tone === "bad" && <X size={12} strokeWidth={2} />}
                <span>{slugStatus.label}</span>
              </SlugBadge>
            )
          }
        >
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            style={inputStyle()}
            placeholder="my-shop"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            {...register("slug")}
          />
          <span className="ms-1 text-[12px]" style={{ color: "var(--ink-4)" }}>
            {t("slugSuffix")}
          </span>
        </Field>

        <Field label={t("ownerNameLabel")} error={fieldError(errors.owner_name?.message, tc)}>
          <input className="w-full bg-transparent outline-none" style={inputStyle()} autoComplete="name" {...register("owner_name")} />
        </Field>

        <Field label={t("emailLabel")} error={fieldError(errors.email?.message, tc)}>
          <input type="email" autoComplete="email" className="w-full bg-transparent outline-none" style={inputStyle()} {...register("email")} />
        </Field>

        <Field label={t("passwordLabel")} error={fieldError(errors.password?.message, tc)}>
          <div className="relative w-full">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
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
        </Field>

        <PasswordStrengthMeter password={password ?? ""} />

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("countryLabel")}>
            <select
              className="w-full bg-transparent outline-none"
              style={inputStyle()}
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={t("localeLabel")}>
            <select
              className="w-full bg-transparent outline-none"
              style={inputStyle()}
              {...register("default_locale")}
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </Field>
        </div>

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
          disabled={
            isSubmitting ||
            mutation.isPending ||
            (slugStatus?.tone === "bad")
          }
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
        {t("loginPrompt")}{" "}
        <Link
          href="/login"
          className="underline underline-offset-4"
          style={{ color: "var(--accent)" }}
        >
          {t("loginCta")}
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]" style={{ color: "var(--ink-3)" }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {hint}
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

function SlugBadge({ tone, children }: { tone: "muted" | "ok" | "bad"; children: React.ReactNode }) {
  const map = {
    muted: { fg: "var(--ink-3)", bg: "transparent" },
    ok: { fg: "var(--sage)", bg: "color-mix(in oklab, var(--sage) 14%, transparent)" },
    bad: { fg: "var(--rose)", bg: "color-mix(in oklab, var(--rose) 14%, transparent)" },
  } as const;
  const c = map[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{ color: c.fg, background: c.bg, fontSize: 11 }}
    >
      {children}
    </span>
  );
}

function inputStyle(): React.CSSProperties {
  return { fontSize: 14, color: "var(--ink)", fontFamily: "inherit" };
}

function fieldError(msg: string | undefined, t: ReturnType<typeof useTranslations>): string | null {
  if (!msg) return null;
  try {
    const v = t(msg);
    return v.startsWith(msg) ? msg : v;
  } catch {
    return msg;
  }
}

function safeT(t: ReturnType<typeof useTranslations>, key: string, fallback: string): string {
  try {
    const v = t(key);
    // next-intl returns the fully-qualified key when missing (e.g.
    // "auth.signup.errors.unknown") so an exact suffix match means missing.
    if (v === key || v.endsWith("." + key) || v.endsWith(key)) return fallback;
    return v;
  } catch {
    return fallback;
  }
}
