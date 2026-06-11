"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { useAuthStore } from "@/lib/auth/store";
import { currencyMinorUnits, minorToMajor } from "@/lib/currency";
import { branchesListRequest } from "@/lib/api/branches";
import {
  trendsRequest,
  type TrendsCompare,
  type TrendsMetric,
  type TrendsWindow,
} from "@/lib/api/reports/trends";
import "./trends.css";

const WINDOW_OPTIONS: TrendsWindow[] = [7, 30, 90];
const METRIC_OPTIONS: TrendsMetric[] = ["revenue", "transactions", "gross_profit"];
const COMPARE_OPTIONS: TrendsCompare[] = ["none", "prev_period", "yoy"];

function formatValue(metric: TrendsMetric, currency: string, locale: "en" | "ar", v: number): string {
  if (metric === "transactions") {
    return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US").format(v);
  }
  // Compact KPI intent: no forced trailing zeros, but allow the currency's
  // real precision (KWD=3, JPY=0) instead of truncating to whole units.
  const code = currency || "USD";
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: currencyMinorUnits(code),
  }).format(minorToMajor(v, code));
}

function shortDate(iso: string, locale: "en" | "ar"): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function TrendsClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("reports.trends");
  const tenant = useAuthStore((s) => s.tenant);
  const currency = tenant?.default_currency_code ?? "USD";

  const [windowDays, setWindow] = useState<TrendsWindow>(30);
  const [metric, setMetric] = useState<TrendsMetric>("revenue");
  const [compare, setCompare] = useState<TrendsCompare>("none");
  const [branchId, setBranchId] = useState<string | "all">("all");

  const branchesQ = useQuery({
    queryKey: ["trends", "branches"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 5 * 60_000,
  });

  const trendsQ = useQuery({
    queryKey: ["trends", currency, metric, windowDays, compare, branchId],
    queryFn: () =>
      trendsRequest({
        currency,
        metric,
        window: windowDays,
        compare,
        branch_id: branchId === "all" ? undefined : branchId,
      }),
    staleTime: 30_000,
  });

  const data = trendsQ.data;
  const isLoading = trendsQ.isPending;
  const isError = trendsQ.isError;
  const isEmpty = data?.series.every((p) => p.value === 0) ?? false;
  const fmt = (v: number) => formatValue(metric, currency, locale, v);

  return (
    <div className="trends-page">
      <header className="trends-header">
        <span className="kicker">{t("kicker")}</span>
        <h1 className="trends-title">{t("title")}</h1>
        <p className="trends-subtitle">{t("subtitle")}</p>
      </header>

      <section className="trends-filters" aria-label={t("filters.window")}>
        <label className="trends-filter">
          <span className="trends-filter-label">{t("filters.window")}</span>
          <select
            value={String(windowDays)}
            onChange={(e) => setWindow(Number(e.target.value) as TrendsWindow)}
          >
            {WINDOW_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {t(`filters.windowOptions.${w === 7 ? "7d" : w === 30 ? "30d" : "90d"}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="trends-filter">
          <span className="trends-filter-label">{t("filters.metric")}</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as TrendsMetric)}
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t(`filters.metricOptions.${m}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="trends-filter">
          <span className="trends-filter-label">{t("filters.compare")}</span>
          <select
            value={compare}
            onChange={(e) => setCompare(e.target.value as TrendsCompare)}
          >
            {COMPARE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {t(`filters.compareOptions.${c}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="trends-filter">
          <span className="trends-filter-label">{t("filters.branch")}</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value as string)}>
            <option value="all">{t("filters.branchOptionAll")}</option>
            {(branchesQ.data?.items ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_i18n[locale] ?? b.code}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="trends-chart-card">
        {isLoading && (
          <div className="trends-state">{t("loading")}</div>
        )}
        {isError && !isLoading && (
          <div className="trends-state trends-state-error" role="alert">
            <strong>{t("error.title")}</strong>
            <p>{t("error.body")}</p>
            <button type="button" onClick={() => trendsQ.refetch()}>
              {t("error.retry")}
            </button>
          </div>
        )}
        {!isLoading && !isError && data && isEmpty && (
          <div className="trends-state trends-empty">
            <TrendingUp size={36} strokeWidth={1.5} />
            <strong>{t("empty.title")}</strong>
            <p>{t("empty.body")}</p>
          </div>
        )}
        {!isLoading && !isError && data && !isEmpty && (
          <TrendLineChart
            series={data.series}
            height={280}
            formatValue={fmt}
            ariaLabel={t("chartAria")}
          />
        )}
      </section>

      {!isLoading && !isError && data && (
        <section className="trends-summary" aria-label="summary">
          <SummaryKpi label={t("summary.currentTotal")} value={fmt(data.summary.current_total)} />
          <SummaryKpi
            label={t("summary.prevTotal")}
            value={data.summary.prev_total !== null ? fmt(data.summary.prev_total) : "—"}
          />
          <SummaryKpi
            label={t("summary.delta")}
            value={
              data.summary.delta_pct !== null
                ? `${data.summary.delta_pct >= 0 ? "+" : ""}${data.summary.delta_pct.toFixed(1)}%`
                : "—"
            }
            trend={data.summary.delta_pct ?? null}
          />
          <SummaryKpi
            label={t("summary.peakDay")}
            value={
              data.summary.peak
                ? `${shortDate(data.summary.peak.date, locale)} · ${fmt(data.summary.peak.value)}`
                : "—"
            }
          />
        </section>
      )}
    </div>
  );
}

function SummaryKpi({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: number | null;
}) {
  const showTrend = typeof trend === "number" && Number.isFinite(trend);
  const up = showTrend && trend! >= 0;
  return (
    <div className="trends-kpi">
      <div className="trends-kpi-label">{label}</div>
      <div className="trends-kpi-value">
        {value}
        {showTrend && (
          <span className={`trends-kpi-trend ${up ? "up" : "dn"}`} aria-hidden="true">
            {up ? <ArrowUp size={12} strokeWidth={1.75} /> : <ArrowDown size={12} strokeWidth={1.75} />}
          </span>
        )}
      </div>
    </div>
  );
}
