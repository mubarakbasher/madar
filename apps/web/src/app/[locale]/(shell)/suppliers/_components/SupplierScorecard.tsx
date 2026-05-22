"use client";

import { useTranslations } from "next-intl";
import type { ApiSupplierStats } from "@/lib/api/suppliers";
import { formatCurrency } from "@/lib/currency";

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

function formatRelative(iso: string | null, locale: string, neverLabel: string): string {
  if (!iso) return neverLabel;
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { numeric: "auto" });
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

export function SupplierScorecard({
  stats,
  currencyCode,
  lastOrderAt,
  locale,
}: {
  stats: ApiSupplierStats;
  currencyCode: string;
  lastOrderAt: string | null;
  locale: "en" | "ar";
}) {
  const t = useTranslations("suppliers.scorecard");

  const spend = Number(stats.total_spend_cents);

  return (
    <div className="sup-scorecard">
      <div className="sup-scorecard-grid">
        <div className="sup-stat">
          <span className="sup-stat-label">{t("fillRate")}</span>
          <span className="sup-stat-value">{formatPct(stats.fill_rate_pct)}</span>
        </div>
        <div className="sup-stat">
          <span className="sup-stat-label">{t("onTime")}</span>
          <span className="sup-stat-value">{formatPct(stats.on_time_pct)}</span>
        </div>
        <div className="sup-stat">
          <span className="sup-stat-label">{t("avgLeadTime")}</span>
          <span className="sup-stat-value">
            {stats.avg_lead_time_days === null
              ? "—"
              : t("days", { days: Math.round(stats.avg_lead_time_days) })}
          </span>
        </div>
        <div className="sup-stat">
          <span className="sup-stat-label">{t("totalSpend")}</span>
          <span className="sup-stat-value">{formatCurrency(spend / 100, currencyCode, locale)}</span>
        </div>
      </div>

      <div className="sup-scorecard-foot">
        <div>
          <div className="sup-stat-mini-label">{t("totalOrders")}</div>
          <div className="sup-stat-mini-value">{stats.total_orders}</div>
        </div>
        <div>
          <div className="sup-stat-mini-label">{t("lastOrder")}</div>
          <div className="sup-stat-mini-value">
            {formatRelative(lastOrderAt, locale, t("never"))}
          </div>
        </div>
      </div>
    </div>
  );
}
