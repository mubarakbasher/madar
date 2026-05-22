"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { ApiError } from "@/lib/api/client";
import { branchesListRequest } from "@/lib/api/branches";
import { categoriesListRequest } from "@/lib/api/catalog";
import {
  pnlReportCsvDownload,
  pnlReportRequest,
  type ApiPnlReport,
  type PnlQueryOpts,
} from "@/lib/api/reports/pnl";
import "./pnl.css";

const READER_ROLES = new Set(["owner", "manager", "accountant", "auditor"]);
type GroupBy = "period" | "branch" | "category" | "sku";
type Preset = "thisWeek" | "thisMonth" | "last30" | "thisYear" | "custom";

interface DateRange {
  from: string;
  to: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeForPreset(preset: Preset): DateRange {
  const today = new Date();
  const to = isoDate(today);
  if (preset === "thisWeek") {
    const d = new Date(today);
    const isoDow = (d.getUTCDay() + 6) % 7; // Mon=0
    d.setUTCDate(d.getUTCDate() - isoDow);
    return { from: isoDate(d), to };
  }
  if (preset === "thisMonth") {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { from: isoDate(d), to };
  }
  if (preset === "last30") {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 29);
    return { from: isoDate(d), to };
  }
  if (preset === "thisYear") {
    const d = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { from: isoDate(d), to };
  }
  return { from: to, to };
}

function formatMoney(cents: string, currency: string, locale: string): string {
  const n = Number(cents) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function PnlClient({ locale }: { locale: string }): JSX.Element {
  const t = useTranslations("reports.pnl");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const tenant = useAuthStore((s) => s.tenant);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canRead = READER_ROLES.has(role);

  const tenantCurrency = tenant?.default_currency_code ?? "USD";

  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("thisMonth"));
  const [currency, setCurrency] = useState<string>(tenantCurrency);
  const [branchId, setBranchId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [groupBy, setGroupBy] = useState<GroupBy>("period");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const branchesQ = useQuery({
    queryKey: ["branches", "summary"],
    queryFn: () => branchesListRequest(),
    enabled: canRead,
    staleTime: 60_000,
  });
  const categoriesQ = useQuery({
    queryKey: ["categories", "list"],
    queryFn: () => categoriesListRequest(),
    enabled: canRead,
    staleTime: 60_000,
  });

  const queryOpts: PnlQueryOpts = useMemo(
    () => ({
      currency,
      from: range.from,
      to: range.to,
      group_by: groupBy,
      ...(branchId ? { branch_id: branchId } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
    }),
    [currency, range.from, range.to, branchId, categoryId, groupBy],
  );

  const reportQ = useQuery<ApiPnlReport>({
    queryKey: ["reports", "pnl", queryOpts],
    queryFn: () => pnlReportRequest(queryOpts),
    enabled: canRead && currency.length === 3,
    staleTime: 30_000,
  });

  const setRangeFromPreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(rangeForPreset(p));
  };

  if (!canRead) {
    return (
      <section className="pnl-shell">
        <header className="pnl-header">
          <span className="kicker">{t("kicker")}</span>
          <h1 className="pnl-title">{t("title")}</h1>
          <p className="pnl-subtitle">{t("errors.forbidden_role")}</p>
        </header>
      </section>
    );
  }

  const report = reportQ.data ?? null;

  const handleCsv = async () => {
    setCsvBusy(true);
    setCsvError(null);
    try {
      await pnlReportCsvDownload(queryOpts, accessToken);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : t("csv.error"));
    } finally {
      setCsvBusy(false);
    }
  };

  const labelForRow = (row: ApiPnlReport["breakdown"][number]): string => {
    if (row.label) return row.label;
    if (row.label_i18n) {
      const li18n = row.label_i18n as { en: string; ar: string };
      return locale === "ar" ? li18n.ar : li18n.en;
    }
    return row.key.slice(0, 8);
  };

  return (
    <section className="pnl-shell">
      <header className="pnl-header">
        <span className="kicker">{t("kicker")}</span>
        <h1 className="pnl-title">{t("title")}</h1>
        <p className="pnl-subtitle">{t("subtitle")}</p>
      </header>

      <div className="pnl-presets" role="tablist">
        {(["thisWeek", "thisMonth", "last30", "thisYear", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            type="button"
            className="pnl-preset-btn"
            aria-pressed={preset === p}
            onClick={() => setRangeFromPreset(p)}
          >
            {t(`presets.${p}`)}
          </button>
        ))}
      </div>

      <div className="pnl-filters">
        <div className="pnl-field">
          <label className="pnl-field-label" htmlFor="pnl-from">
            {t("filters.from")}
          </label>
          <input
            id="pnl-from"
            className="pnl-input"
            type="date"
            value={range.from}
            onChange={(e) => {
              setPreset("custom");
              setRange((r) => ({ ...r, from: e.target.value }));
            }}
          />
        </div>
        <div className="pnl-field">
          <label className="pnl-field-label" htmlFor="pnl-to">
            {t("filters.to")}
          </label>
          <input
            id="pnl-to"
            className="pnl-input"
            type="date"
            value={range.to}
            onChange={(e) => {
              setPreset("custom");
              setRange((r) => ({ ...r, to: e.target.value }));
            }}
          />
        </div>
        <div className="pnl-field">
          <label className="pnl-field-label" htmlFor="pnl-currency">
            {t("filters.currency")}
          </label>
          <input
            id="pnl-currency"
            className="pnl-input"
            type="text"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            style={{ width: 80, textTransform: "uppercase" }}
          />
        </div>
        <div className="pnl-field">
          <label className="pnl-field-label" htmlFor="pnl-branch">
            {t("filters.branch")}
          </label>
          <select
            id="pnl-branch"
            className="pnl-select"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">{t("filters.allBranches")}</option>
            {branchesQ.data?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {locale === "ar" ? b.name_i18n.ar : b.name_i18n.en}
              </option>
            ))}
          </select>
        </div>
        <div className="pnl-field">
          <label className="pnl-field-label" htmlFor="pnl-category">
            {t("filters.category")}
          </label>
          <select
            id="pnl-category"
            className="pnl-select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t("filters.allCategories")}</option>
            {categoriesQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === "ar" ? c.name_i18n.ar : c.name_i18n.en}
              </option>
            ))}
          </select>
        </div>
        <div className="pnl-field" style={{ marginInlineStart: "auto" }}>
          <span className="pnl-field-label">&nbsp;</span>
          <button
            type="button"
            className="pnl-csv-btn"
            disabled={csvBusy || !report}
            onClick={() => void handleCsv()}
          >
            {csvBusy ? t("csv.downloading") : t("csv.download")}
          </button>
        </div>
      </div>

      {report?.mixed_currency_warning && (
        <div className="pnl-warning">{t("mixedCurrencyWarning")}</div>
      )}
      {csvError && <div className="pnl-warning">{csvError}</div>}

      {reportQ.isPending && <div className="pnl-empty">{t("loading")}</div>}

      {reportQ.isError && (
        <div className="pnl-error">
          <div className="pnl-error-title">{t("error.title")}</div>
          <p style={{ color: "var(--ink-2)", fontSize: 13, marginBottom: 12 }}>
            {reportQ.error instanceof ApiError
              ? translateError(t, reportQ.error.code)
              : t("error.body")}
          </p>
          <button
            type="button"
            className="pnl-csv-btn"
            onClick={() => void reportQ.refetch()}
          >
            {t("error.retry")}
          </button>
        </div>
      )}

      {report && (
        <>
          <article className="pnl-statement" aria-label={t("title")}>
            <span className="pnl-statement-kicker">{report.currency}</span>
            <h2 className="pnl-statement-period">{report.period_label}</h2>

            <span className="pnl-row-label">{t("statement.revenue")}</span>
            <span className="pnl-row-value">
              {formatMoney(report.revenue_cents, report.currency, locale)}
            </span>

            <span className="pnl-row-label">{t("statement.discount")}</span>
            <span className="pnl-row-value">
              −{formatMoney(report.discount_cents, report.currency, locale)}
            </span>

            <span className="pnl-row-label">{t("statement.tax")}</span>
            <span className="pnl-row-value">
              −{formatMoney(report.tax_cents, report.currency, locale)}
            </span>

            <span className="pnl-row-label">{t("statement.cogs")}</span>
            <span className="pnl-row-value">
              −{formatMoney(report.cogs_cents, report.currency, locale)}
            </span>

            <div className="pnl-row-rule" />

            <span className="pnl-row-label pnl-row-total">
              <span className="pnl-row-label">{t("statement.grossProfit")}</span>
            </span>
            <span className="pnl-row-value pnl-row-total">
              {formatMoney(report.gross_profit_cents, report.currency, locale)}
              <span
                style={{
                  display: "inline-block",
                  marginInlineStart: 8,
                  fontSize: 12,
                  color: "var(--ink-3)",
                  fontWeight: 400,
                }}
              >
                ({report.gross_profit_pct.toFixed(2)}%)
              </span>
            </span>

            <span className="pnl-row-label">{t("statement.refunds")}</span>
            <span className="pnl-row-value">
              −{formatMoney(report.refunds_cents, report.currency, locale)}
            </span>

            <div className="pnl-row-rule" />

            <div className="pnl-row-net" style={{ display: "contents" }}>
              <span className="pnl-row-label">{t("statement.netRevenue")}</span>
              <span className="pnl-row-value">
                {formatMoney(report.net_revenue_cents, report.currency, locale)}
              </span>
            </div>

            <span className="pnl-row-label" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {t("statement.transactions")}
            </span>
            <span className="pnl-row-value" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {report.transactions}
            </span>
          </article>

          <section className="pnl-breakdown">
            <header className="pnl-breakdown-header">
              <h3 className="pnl-breakdown-title">{t("breakdown.label")}</h3>
              <div className="pnl-segments" role="tablist">
                {(["period", "branch", "category", "sku"] as GroupBy[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="pnl-segment-btn"
                    aria-pressed={groupBy === g}
                    onClick={() => setGroupBy(g)}
                  >
                    {t(
                      `breakdown.${
                        g === "period"
                          ? "groupByPeriod"
                          : g === "branch"
                            ? "groupByBranch"
                            : g === "category"
                              ? "groupByCategory"
                              : "groupBySku"
                      }`,
                    )}
                  </button>
                ))}
              </div>
            </header>

            {report.breakdown.length === 0 ? (
              <div className="pnl-empty">
                <div className="pnl-empty-title">{t("empty.title")}</div>
                <p style={{ fontSize: 13 }}>{t("empty.body")}</p>
              </div>
            ) : (
              <table className="pnl-table">
                <thead>
                  <tr>
                    <th>{t("breakdown.columns.key")}</th>
                    <th>{t("breakdown.columns.revenue")}</th>
                    <th>{t("breakdown.columns.cogs")}</th>
                    <th>{t("breakdown.columns.profit")}</th>
                    <th>{t("breakdown.columns.transactions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.breakdown.map((row) => (
                    <tr key={row.key}>
                      <td>{labelForRow(row)}</td>
                      <td>{formatMoney(row.revenue_cents, report.currency, locale)}</td>
                      <td>{formatMoney(row.cogs_cents, report.currency, locale)}</td>
                      <td>{formatMoney(row.gross_profit_cents, report.currency, locale)}</td>
                      <td>{row.transactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function translateError(
  t: ReturnType<typeof useTranslations<"reports.pnl">>,
  code: string,
): string {
  if (code === "forbidden_role") return t("errors.forbidden_role");
  if (code === "validation_failed") return t("errors.validation_failed");
  return t("errors.generic");
}
