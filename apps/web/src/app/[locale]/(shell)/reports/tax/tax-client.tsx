"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Download, FileText, AlertCircle } from "lucide-react";
import "./tax.css";
import {
  taxReportRequest,
  taxReportDownload,
  triggerBlobDownload,
  type ApiTaxReport,
  type TaxReportQuery,
} from "@/lib/api/reports/tax";
import { branchesListRequest } from "@/lib/api/branches";
import { useAuthStore } from "@/lib/auth/store";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function thirtyDaysAgoIso(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
}

function formatMoney(cents: string, currency: string, locale: "en" | "ar"): string {
  const big = BigInt(cents);
  const major = Number(big) / 100;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

function formatRate(rateBps: number): string {
  return `${(rateBps / 100).toFixed(2)}%`;
}

export function TaxReportClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("reports.tax");
  const defaultCurrency = useAuthStore((s) => s.tenant?.default_currency_code ?? "USD");

  const [currency, setCurrency] = useState<string>(defaultCurrency);
  const [from, setFrom] = useState<string>(thirtyDaysAgoIso());
  const [to, setTo] = useState<string>(todayIso());
  const [branchId, setBranchId] = useState<string>("");
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const branchesQ = useQuery({
    queryKey: ["branches", "list"],
    queryFn: () => branchesListRequest(),
    staleTime: 5 * 60_000,
  });

  const query: TaxReportQuery = useMemo(
    () => ({ currency: currency.toUpperCase(), from, to, ...(branchId ? { branch_id: branchId } : {}) }),
    [currency, from, to, branchId],
  );

  const reportQ = useQuery<ApiTaxReport>({
    queryKey: ["reports", "tax", query],
    queryFn: () => taxReportRequest(query),
    staleTime: 30_000,
  });

  async function handleDownload(format: "pdf" | "csv"): Promise<void> {
    setDownloadError(null);
    setDownloading(format);
    try {
      const blob = await taxReportDownload(query, format);
      triggerBlobDownload(blob, `tax_${from}_${to}.${format}`);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  const report = reportQ.data;

  return (
    <div className="rep-tax">
      <header className="rep-tax-head">
        <span className="kicker">{t("kicker")}</span>
        <h1 className="rep-tax-title">{t("title")}</h1>
        <p className="rep-tax-sub">{t("subtitle")}</p>
        {report?.tax_registration_number ? (
          <p className="rep-tax-trn">
            <span>{t("taxRegLabel")}</span>
            <code>{report.tax_registration_number}</code>
          </p>
        ) : null}
      </header>

      <section className="rep-tax-filters" aria-label={t("filters.currency")}>
        <label className="rep-tax-field">
          <span>{t("filters.currency")}</span>
          <input
            type="text"
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="rep-tax-input"
          />
        </label>
        <label className="rep-tax-field">
          <span>{t("filters.from")}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rep-tax-input"
          />
        </label>
        <label className="rep-tax-field">
          <span>{t("filters.to")}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rep-tax-input"
          />
        </label>
        <label className="rep-tax-field">
          <span>{t("filters.branch")}</span>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rep-tax-input"
          >
            <option value="">{t("filters.allBranches")}</option>
            {branchesQ.data?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_i18n[locale] || b.name_i18n.en || b.code}
              </option>
            ))}
          </select>
        </label>

        <div className="rep-tax-actions">
          <button
            type="button"
            className="rep-tax-btn"
            onClick={() => handleDownload("pdf")}
            disabled={downloading !== null || reportQ.isPending}
          >
            <FileText size={16} strokeWidth={1.5} />
            {downloading === "pdf" ? t("downloads.downloading") : t("downloads.pdf")}
          </button>
          <button
            type="button"
            className="rep-tax-btn"
            onClick={() => handleDownload("csv")}
            disabled={downloading !== null || reportQ.isPending}
          >
            <Download size={16} strokeWidth={1.5} />
            {downloading === "csv" ? t("downloads.downloading") : t("downloads.csv")}
          </button>
        </div>
      </section>

      {downloadError ? (
        <div className="rep-tax-error" role="alert">
          <AlertCircle size={16} strokeWidth={1.5} />
          {t("downloads.error")}
        </div>
      ) : null}

      {reportQ.isPending ? (
        <div className="rep-tax-empty">{t("loading")}</div>
      ) : reportQ.isError ? (
        <div className="rep-tax-error-state" role="alert">
          <h3>{t("error.title")}</h3>
          <p>{t("error.body")}</p>
          <button type="button" className="rep-tax-btn" onClick={() => reportQ.refetch()}>
            {t("error.retry")}
          </button>
        </div>
      ) : !report || report.items.length === 0 ? (
        <div className="rep-tax-empty">
          <h3>{t("empty.title")}</h3>
          <p>{t("empty.body")}</p>
        </div>
      ) : (
        <div className="rep-tax-table-wrap">
          <table className="rep-tax-table">
            <thead>
              <tr>
                <th className="rep-tax-th-start">{t("table.taxClass")}</th>
                <th className="rep-tax-th-end">{t("table.rate")}</th>
                <th className="rep-tax-th-end">{t("table.taxableSales")}</th>
                <th className="rep-tax-th-end">{t("table.taxCollected")}</th>
                <th className="rep-tax-th-end">{t("table.transactions")}</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((it) => {
                const label = it.tax_class_code
                  ? it.tax_class_name_i18n?.[locale] ||
                    it.tax_class_name_i18n?.en ||
                    it.tax_class_code
                  : t("table.noTaxClass");
                return (
                  <tr key={it.tax_class_id ?? "none"}>
                    <td className="rep-tax-td-start">
                      <span className="rep-tax-chip">{it.tax_class_code ?? "—"}</span>
                      <span className="rep-tax-name">{label}</span>
                    </td>
                    <td className="rep-tax-td-end rep-tax-num">{formatRate(it.rate_bps)}</td>
                    <td className="rep-tax-td-end rep-tax-num">
                      {formatMoney(it.taxable_sales_cents, report.currency, locale)}
                    </td>
                    <td className="rep-tax-td-end rep-tax-num">
                      {formatMoney(it.tax_collected_cents, report.currency, locale)}
                    </td>
                    <td className="rep-tax-td-end rep-tax-num">{it.transactions}</td>
                  </tr>
                );
              })}
              <tr className="rep-tax-totals">
                <td className="rep-tax-td-start">
                  <strong>{t("table.totals")}</strong>
                </td>
                <td className="rep-tax-td-end" />
                <td className="rep-tax-td-end rep-tax-num">
                  <strong>
                    {formatMoney(report.totals.taxable_sales_cents, report.currency, locale)}
                  </strong>
                </td>
                <td className="rep-tax-td-end rep-tax-num">
                  <strong>
                    {formatMoney(report.totals.tax_collected_cents, report.currency, locale)}
                  </strong>
                </td>
                <td className="rep-tax-td-end rep-tax-num">
                  <strong>{report.totals.transactions}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
