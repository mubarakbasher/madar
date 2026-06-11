"use client";

import { useTranslations } from "next-intl";
import type { ApiBranchDetail } from "@/lib/api/branches";
import { formatCurrency, formatNumber, minorToMajor } from "@/lib/currency";

function relTime(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const fmt = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { numeric: "auto" });
  if (mins < 60) return fmt.format(-mins, "minute");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return fmt.format(-hrs, "hour");
  const days = Math.floor(hrs / 24);
  return fmt.format(-days, "day");
}

export function OverviewTab({
  branch,
  locale,
  onViewStaff,
}: {
  branch: ApiBranchDetail;
  locale: string;
  onViewStaff: () => void;
}) {
  const t = useTranslations("branches.detail.overview");
  const topName = branch.kpis.top_product_name
    ? locale === "ar"
      ? branch.kpis.top_product_name.ar || branch.kpis.top_product_name.en
      : branch.kpis.top_product_name.en
    : null;

  return (
    <>
      <div className="br-kpi-row">
        <div className="br-kpi">
          <div className="br-kpi-label">{t("todayRevenue")}</div>
          <div className="br-kpi-value">
            {formatCurrency(minorToMajor(branch.today_revenue_cents, branch.currency_code), branch.currency_code, locale)}
          </div>
        </div>
        <div className="br-kpi">
          <div className="br-kpi-label">{t("weekRevenue")}</div>
          <div className="br-kpi-value">
            {formatCurrency(minorToMajor(branch.kpis.week_revenue_cents, branch.currency_code), branch.currency_code, locale)}
          </div>
        </div>
        <div className="br-kpi">
          <div className="br-kpi-label">{t("transactionsToday")}</div>
          <div className="br-kpi-value">{formatNumber(branch.kpis.transactions_today, locale)}</div>
        </div>
        <div className="br-kpi">
          <div className="br-kpi-label">{t("transactionsWeek")}</div>
          <div className="br-kpi-value">{formatNumber(branch.kpis.transactions_week, locale)}</div>
        </div>
      </div>

      <section className="br-section">
        <h3 className="br-section-title">{t("topProduct")}</h3>
        {topName ? (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span>{topName}</span>
            <span className="br-list-meta">
              {formatNumber(branch.kpis.units_sold_top_product, locale)}
            </span>
          </div>
        ) : (
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>{t("topProductEmpty")}</p>
        )}
      </section>

      <section className="br-section">
        <h3 className="br-section-title">{t("staffSummaryTitle")}</h3>
        <div className="br-overview-staff-link">
          <span>{t("staffSummaryCount", { count: branch.users.length })}</span>
          <button type="button" className="br-link" onClick={onViewStaff}>
            {t("viewStaffLink")}
          </button>
        </div>
      </section>

      <section className="br-section">
        <h3 className="br-section-title">{t("recentActivity")}</h3>
        {branch.recent_activity.length === 0 ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>{t("recentEmpty")}</p>
        ) : (
          <ul className="br-list">
            {branch.recent_activity.map((a) => (
              <li key={a.id} className="br-list-item">
                <span>
                  {a.action === "sale_completed" && a.reference
                    ? t("saleRef", { code: a.reference })
                    : a.action}
                  {a.actor_name ? ` · ${a.actor_name}` : ""}
                </span>
                <span className="br-list-meta">{relTime(a.occurred_at, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
