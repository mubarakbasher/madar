"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import "./movers.css";
import {
  moversRequest,
  type ApiMoverItem,
  type MoversMetric,
} from "@/lib/api/reports/movers";
import { branchScopeParam, useBranchScopeStore } from "@/lib/branch-scope/store";
import { useAuthStore } from "@/lib/auth/store";
import { currencyMinorUnits } from "@/lib/currency";
import { Sparkline } from "../../_dashboard/Sparkline";

/**
 * Movers / margin analysis. PAGES §39.
 *
 * Three ranked lists of products (revenue / units / profit) over a date
 * window, plus a slow-movers panel. Tab strip toggles the active metric and
 * persists via `?metric=` in the URL.
 */
export function MoversClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("reports.movers");
  const tenant = useAuthStore((s) => s.tenant);
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const hydrated = useBranchScopeStore((s) => s.hydrated);
  const hydrate = useBranchScopeStore((s) => s.hydrate);
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMetric = (searchParams.get("metric") ?? "revenue") as MoversMetric;
  const metric: MoversMetric =
    urlMetric === "units" || urlMetric === "profit" ? urlMetric : "revenue";

  // Default window: last 14 days, inclusive.
  const today = new Date();
  const defaultFrom = isoDate(new Date(today.getTime() - 13 * 86_400_000));
  const defaultTo = isoDate(today);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const currency = tenant?.default_currency_code ?? "USD";
  const branchParam = branchScopeParam(selectedBranchId);

  const setMetric = (m: MoversMetric) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("metric", m);
    router.replace(`?${sp.toString()}`);
  };

  const q = useQuery({
    queryKey: ["reports", "movers", { currency, from, to, branchParam, metric }],
    queryFn: () =>
      moversRequest({
        currency,
        from,
        to,
        branch_id: branchParam ?? undefined,
        metric,
        limit: 20,
      }),
    staleTime: 30_000,
  });

  return (
    <div className="mvr">
      <header className="mvr-head">
        <p className="mvr-kicker">{t("kicker")}</p>
        <h1 className="mvr-title">{t("title")}</h1>
        <p className="mvr-sub">{t("subtitle")}</p>
      </header>

      <div className="mvr-filters" role="group" aria-label={t("filters.currency")}>
        <label className="mvr-filter">
          <span className="mvr-filter-label">{t("filters.from")}</span>
          <input
            type="date"
            className="mvr-input"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="mvr-filter">
          <span className="mvr-filter-label">{t("filters.to")}</span>
          <input
            type="date"
            className="mvr-input"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="mvr-filter">
          <span className="mvr-filter-label">{t("filters.currency")}</span>
          <span className="mvr-currency">{currency}</span>
        </div>
      </div>

      <nav className="mvr-tabs" aria-label={t("title")}>
        {(["revenue", "units", "profit"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`mvr-tab${metric === m ? " is-active" : ""}`}
            aria-pressed={metric === m}
            onClick={() => setMetric(m)}
          >
            {t(`tabs.${m}` as const)}
          </button>
        ))}
      </nav>

      {q.isPending ? (
        <p className="mvr-state">{t("loading")}</p>
      ) : q.isError ? (
        <div className="mvr-state mvr-error">
          <h2 className="mvr-state-title">{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button type="button" className="mvr-btn" onClick={() => void q.refetch()}>
            {t("error.retry")}
          </button>
        </div>
      ) : q.data.items.length === 0 ? (
        <div className="mvr-state">
          <h2 className="mvr-state-title">{t("empty.title")}</h2>
          <p>{t("empty.body")}</p>
        </div>
      ) : (
        <ul className="mvr-list">
          {q.data.items.map((item) => (
            <MoverRow
              key={item.product_id}
              item={item}
              metric={metric}
              currency={currency}
              locale={locale}
              t={t}
            />
          ))}
        </ul>
      )}

      <section className="mvr-slow">
        <header className="mvr-slow-head">
          <h2 className="mvr-slow-title">{t("slowMovers.title")}</h2>
          <p className="mvr-slow-body">{t("slowMovers.body")}</p>
        </header>
        {q.isSuccess && q.data.slow_movers.length > 0 ? (
          <ul className="mvr-list mvr-list-slow">
            {q.data.slow_movers.map((item) => (
              <MoverRow
                key={item.product_id}
                item={item}
                metric={metric}
                currency={currency}
                locale={locale}
                t={t}
                slow
              />
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function MoverRow({
  item,
  metric,
  currency,
  locale,
  t,
  slow,
}: {
  item: ApiMoverItem;
  metric: MoversMetric;
  currency: string;
  locale: "en" | "ar";
  t: (k: string) => string;
  slow?: boolean;
}) {
  const value = useMemo(() => {
    if (metric === "units") return String(item.units);
    const cents =
      metric === "profit" ? item.gross_profit_cents : item.revenue_cents;
    return formatCurrency(BigInt(cents), currency, locale);
  }, [metric, item, currency, locale]);

  const name = item.name_i18n[locale] || item.name_i18n.en || item.sku;
  return (
    <li className={`mvr-row${slow ? " is-slow" : ""}`}>
      <div className="mvr-row-main">
        <p className="mvr-row-name">{name}</p>
        <p className="mvr-row-meta">
          <span className="mvr-sku">{item.sku}</span>
          {item.category_name_i18n ? (
            <span className="mvr-cat">
              {item.category_name_i18n[locale] || item.category_name_i18n.en}
            </span>
          ) : null}
        </p>
      </div>
      <div className="mvr-row-spark" aria-label={t("columns.sparkline")}>
        <Sparkline data={item.sparkline_7d} />
      </div>
      <div className="mvr-row-value">
        <p className="mvr-value">{value}</p>
        <p className="mvr-margin">
          {t("columns.margin")}: {formatPct(item.gross_profit_pct, locale)}
        </p>
      </div>
    </li>
  );
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatCurrency(cents: bigint, currency: string, locale: "en" | "ar"): string {
  const minor = currencyMinorUnits(currency);
  const divisor = 10n ** BigInt(minor);
  const whole = Number(cents / divisor);
  const remainder = Number(cents % divisor) / Number(divisor);
  const value = whole + remainder;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
      style: "currency",
      currency,
      maximumFractionDigits: minor,
      minimumFractionDigits: minor,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(minor)}`;
  }
}

function formatPct(v: number, locale: "en" | "ar"): string {
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(v / 100);
  } catch {
    return `${v}%`;
  }
}
