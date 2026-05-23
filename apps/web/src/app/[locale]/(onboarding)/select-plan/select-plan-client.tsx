"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "../../../../../i18n/routing";
import { ApiError } from "../../../../lib/api/client";
import { tryRefresh } from "../../../../lib/api/client";
import type { ApiPlan } from "../../../../lib/api/billing";
import { publicPlansRequest, selectPlanRequest } from "../../../../lib/api/onboarding";

function formatPrice(cents: string, currency: string, locale: string): string {
  const major = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat(locale === "ar" ? "ar" : "en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: major % 1 === 0 ? 0 : 2,
  }).format(major);
}

function pickName(name_i18n: { en: string; ar: string }, locale: string): string {
  return locale === "ar" ? name_i18n.ar || name_i18n.en : name_i18n.en || name_i18n.ar;
}

function formatLimit(n: unknown, unlimitedLabel: string): string {
  if (typeof n !== "number") return "—";
  if (n === -1) return unlimitedLabel;
  return new Intl.NumberFormat("en-US").format(n);
}

export function SelectPlanClient() {
  const t = useTranslations("onboarding.selectPlan");
  const locale = useLocale();
  const router = useRouter();
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const plansQ = useQuery({
    queryKey: ["public", "plans"],
    queryFn: publicPlansRequest,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (planId: string) => selectPlanRequest(planId),
    onSuccess: async () => {
      // Refresh the auth store so it sees the new tenant.plan, otherwise
      // useRedirectOnNoPlan would bounce us right back to /onboarding.
      await tryRefresh();
      router.replace("/");
    },
    onError: () => {
      setPendingPlanId(null);
    },
  });

  const onPick = (planId: string) => {
    setPendingPlanId(planId);
    mutation.mutate(planId);
  };

  if (plansQ.isPending) {
    return (
      <div className="flex min-h-[280px] items-center justify-center" aria-busy="true">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  if (plansQ.isError) {
    return (
      <div
        className="rounded-xl p-6"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          color: "var(--ink-3)",
        }}
      >
        <p style={{ fontSize: 14 }}>{t("errors.network")}</p>
        <button
          type="button"
          className="mt-3 underline"
          style={{ color: "var(--accent)", fontSize: 13 }}
          onClick={() => void plansQ.refetch()}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const plans = plansQ.data.items;

  if (plans.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 28,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          {t("emptyTitle")}
        </h1>
        <p
          className="mx-auto mt-3 max-w-md"
          style={{ color: "var(--ink-3)", fontSize: 14, lineHeight: 1.6 }}
        >
          {t("emptyBody")}
        </p>
      </div>
    );
  }

  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const errorMessage = apiError ? errorKeyFor(apiError.code, t) : null;

  return (
    <div>
      <header>
        <span
          className="uppercase tracking-wider"
          style={{ color: "var(--ink-4)", fontSize: 11, letterSpacing: "0.08em" }}
        >
          {t("kicker")}
        </span>
        <h1
          className="mt-2"
          style={{
            fontFamily: "var(--serif)",
            fontSize: "clamp(28px, 3.4vw, 40px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {t("title")}
        </h1>
        <p
          className="mt-2 max-w-xl"
          style={{ color: "var(--ink-3)", fontSize: 14, lineHeight: 1.6 }}
        >
          {t("subtitle")}
        </p>
      </header>

      {errorMessage ? (
        <div
          className="mt-6 rounded-md px-4 py-3"
          style={{
            background: "color-mix(in oklab, var(--accent) 8%, var(--paper))",
            color: "var(--ink-2)",
            border: "1px solid var(--rule)",
            fontSize: 13,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            locale={locale}
            ctaLabel={t("chooseCta")}
            unlimitedLabel={t("unlimited")}
            limitsLabels={{
              txns: t("limit.txns"),
              users: t("limit.users"),
              branches: t("limit.branches"),
              storage: t("limit.storage"),
            }}
            perMonthLabel={t("perMonth")}
            isPending={mutation.isPending && pendingPlanId === plan.id}
            disabled={mutation.isPending && pendingPlanId !== plan.id}
            onPick={() => onPick(plan.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  locale,
  ctaLabel,
  unlimitedLabel,
  limitsLabels,
  perMonthLabel,
  isPending,
  disabled,
  onPick,
}: {
  plan: ApiPlan;
  locale: string;
  ctaLabel: string;
  unlimitedLabel: string;
  limitsLabels: { txns: string; users: string; branches: string; storage: string };
  perMonthLabel: string;
  isPending: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const limits = plan.limits as Partial<Record<"txns" | "users" | "branches" | "storage_gb", number>>;

  return (
    <article
      className="flex flex-col gap-5 rounded-xl p-6"
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
      }}
    >
      <div>
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontSize: 22,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
          }}
        >
          {pickName(plan.name_i18n, locale)}
        </h2>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            style={{
              fontFamily: "var(--serif)",
              fontSize: 32,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {formatPrice(plan.monthly_price_cents, plan.currency_code, locale)}
          </span>
          <span style={{ color: "var(--ink-4)", fontSize: 12 }}>{perMonthLabel}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        <LimitRow
          icon
          label={`${formatLimit(limits.txns, unlimitedLabel)} ${limitsLabels.txns}`}
        />
        <LimitRow
          icon
          label={`${formatLimit(limits.users, unlimitedLabel)} ${limitsLabels.users}`}
        />
        <LimitRow
          icon
          label={`${formatLimit(limits.branches, unlimitedLabel)} ${limitsLabels.branches}`}
        />
        <LimitRow
          icon
          label={`${formatLimit(limits.storage_gb, unlimitedLabel)} ${limitsLabels.storage}`}
        />
      </ul>

      <button
        type="button"
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5"
        style={{
          background: "var(--accent)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 500,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled || isPending ? "not-allowed" : "pointer",
        }}
        onClick={onPick}
        disabled={disabled || isPending}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
        <span>{ctaLabel}</span>
      </button>
    </article>
  );
}

function LimitRow({ label }: { icon: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check size={14} strokeWidth={2} style={{ color: "var(--accent)" }} />
      <span>{label}</span>
    </li>
  );
}

function errorKeyFor(code: string, t: (key: string) => string): string {
  switch (code) {
    case "plan_not_found":
      return t("errors.planNotFound");
    case "plan_inactive":
      return t("errors.planInactive");
    case "plan_already_assigned":
      return t("errors.planAlreadyAssigned");
    default:
      return t("errors.network");
  }
}
