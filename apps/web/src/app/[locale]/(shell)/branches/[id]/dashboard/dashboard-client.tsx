"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import { branchDashboardRequest, type ApiBranchDashboard } from "@/lib/api/branches";
import { formatCurrency, formatNumber } from "@/lib/currency";
import { HourlyChart } from "../../_components/HourlyChart";
import { CategoriesDonut } from "../../_components/CategoriesDonut";

export function DashboardClient({ locale, id }: { locale: "en" | "ar"; id: string }) {
  const t = useTranslations("branches.detail.performance");
  const tBr = useTranslations("branches");
  const tChart = useTranslations("branches.detail.performance.charts");

  const q = useQuery({
    queryKey: ["branches", "dashboard", id],
    queryFn: () => branchDashboardRequest(id),
    staleTime: 30_000,
  });

  if (q.isPending) {
    return (
      <div className="br">
        <div className="br-skeleton">{tBr("loading")}</div>
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="br">
        <div className="br-error">
          <h2>{tBr("notFound.title")}</h2>
          <a className="br-btn" href={`/${locale}/branches/${id}`}>
            {t("back")}
          </a>
        </div>
      </div>
    );
  }

  const d: ApiBranchDashboard = q.data;
  const name = locale === "ar" ? d.branch_name_i18n.ar || d.branch_name_i18n.en : d.branch_name_i18n.en;
  const todayMajor = Number(d.today_cents) / 100;
  const avgBasketMajor = Number(d.avg_basket_cents) / 100;
  const positive = (d.vs_yesterday_pct ?? 0) >= 0;

  return (
    <div className="br">
      <div className="br-detail-head">
        <div>
          <div className="br-kicker">{t("kicker")}</div>
          <h1 className="br-title">{name}</h1>
        </div>
        <a className="br-btn" href={`/${locale}/branches/${id}`}>
          <ArrowLeft size={13} strokeWidth={1.5} /> {t("back")}
        </a>
      </div>

      <section className="br-section" style={{ paddingBlock: 28 }}>
        <div className="br-kpi-label" style={{ textAlign: "center", marginBlockEnd: 8 }}>
          {t("todayLabel")}
        </div>
        <div
          className="br-title"
          style={{ fontSize: "clamp(48px, 8vw, 72px)", textAlign: "center", lineHeight: 1.05 }}
        >
          {formatCurrency(todayMajor, d.currency_code, locale)}
        </div>
        {d.vs_yesterday_pct !== null && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              alignItems: "center",
              marginBlockStart: 6,
              color: positive ? "#1f7a4d" : "#b03a2e",
              fontSize: 13,
            }}
          >
            {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>
              {positive ? "+" : ""}
              {d.vs_yesterday_pct}% {t("vsYesterday")}
            </span>
          </div>
        )}
      </section>

      <div className="br-kpi-row">
        <div className="br-kpi">
          <div className="br-kpi-label">{t("cards.transactions")}</div>
          <div className="br-kpi-value">{formatNumber(d.transactions_today, locale)}</div>
        </div>
        <div className="br-kpi">
          <div className="br-kpi-label">{t("cards.avgBasket")}</div>
          <div className="br-kpi-value">
            {formatCurrency(avgBasketMajor, d.currency_code, locale)}
          </div>
        </div>
        <div className="br-kpi">
          <div className="br-kpi-label">{t("cards.itemsSold")}</div>
          <div className="br-kpi-value">{formatNumber(d.items_sold_today, locale)}</div>
        </div>
        <div className="br-kpi">
          <div className="br-kpi-label">{t("cards.returns")}</div>
          <div className="br-kpi-value">{formatNumber(d.returns_today, locale)}</div>
        </div>
      </div>

      <section className="br-section">
        <h3 className="br-section-title">{tChart("hourly")}</h3>
        {d.hourly.every((h) => h.cents === 0) ? (
          <p className="br-empty-line">{tChart("hourlyEmpty")}</p>
        ) : (
          <HourlyChart data={d.hourly} />
        )}
      </section>

      <section className="br-section">
        <h3 className="br-section-title">{tChart("topCategories")}</h3>
        {d.top_categories.length === 0 ? (
          <p className="br-empty-line">{tChart("topCategoriesEmpty")}</p>
        ) : (
          <CategoriesDonut data={d.top_categories} locale={locale} labelMissing="—" />
        )}
      </section>

      <section className="br-section">
        <h3 className="br-section-title">{t("leaderboard.title")}</h3>
        {d.leaderboard.length <= 1 ? (
          <p className="br-empty-line">{t("leaderboard.single")}</p>
        ) : (
          <ul className="br-list">
            {d.leaderboard.map((row) => {
              const isMe = row.branch_id === id;
              const rowName = locale === "ar" ? row.name_i18n.ar || row.name_i18n.en : row.name_i18n.en;
              return (
                <li
                  key={row.branch_id}
                  className="br-list-item"
                  style={isMe ? { fontWeight: 500 } : undefined}
                >
                  <span>
                    {t("leaderboard.rank", { rank: row.rank })} · {rowName}
                    {isMe ? ` · ${t("leaderboard.thisBranch")}` : ""}
                  </span>
                  <span className="br-list-meta">
                    {formatCurrency(Number(row.today_cents) / 100, d.currency_code, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
