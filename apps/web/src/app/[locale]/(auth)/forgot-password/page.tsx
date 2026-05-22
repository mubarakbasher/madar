"use client";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "../../../../../i18n/routing";
import { forgotPasswordRequest } from "../../../../lib/api/auth";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot");
  const locale = useLocale();
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: forgotPasswordRequest,
  });

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

      {mutation.isSuccess ? (
        <div className="mt-7 rounded-xl border p-5" style={{ borderColor: "var(--rule)" }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, marginBottom: 6 }}>
            {t("successTitle")}
          </h2>
          <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{t("successBody")}</p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm underline underline-offset-4"
            style={{ color: "var(--accent)" }}
          >
            ← {t("backToLogin")}
          </Link>
        </div>
      ) : (
        <form
          className="mt-7 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ email, locale: locale === "ar" ? "ar" : "en" });
          }}
          noValidate
        >
          <label className="block">
            <div className="mb-1.5 text-[12px]" style={{ color: "var(--ink-3)", fontWeight: 500 }}>
              {t("emailLabel")}
            </div>
            <div
              className="flex w-full items-center rounded-xl border px-3 py-2.5"
              style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
            >
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent outline-none"
                style={{ fontSize: 14, color: "var(--ink)", fontFamily: "inherit" }}
              />
            </div>
          </label>

          {mutation.isError && (
            <div
              role="alert"
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "color-mix(in oklab, var(--rose) 14%, transparent)",
                color: "var(--rose)",
                border: "1px solid color-mix(in oklab, var(--rose) 24%, transparent)",
              }}
            >
              {t("errors.network")}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium transition disabled:opacity-60"
            style={{
              background: "var(--accent)",
              color: "white",
              boxShadow:
                "0 6px 24px -14px color-mix(in oklab, var(--accent) 70%, transparent)",
            }}
          >
            {mutation.isPending ? t("submitting") : t("submit")}
            <ArrowRight size={16} strokeWidth={1.5} className="rtl:rotate-180" />
          </button>

          <Link
            href="/login"
            className="self-center text-sm underline underline-offset-4"
            style={{ color: "var(--ink-3)" }}
          >
            ← {t("backToLogin")}
          </Link>
        </form>
      )}
    </div>
  );
}
