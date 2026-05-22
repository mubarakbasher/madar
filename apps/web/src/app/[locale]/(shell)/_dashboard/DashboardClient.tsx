"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import "./dashboard.css";
import { DashboardHeader } from "./DashboardHeader";
import { KpiRow } from "./KpiRow";
import { RevenueHeroChart } from "./RevenueHeroChart";
import { AIInsightsRail } from "./AIInsightsRail";
import { BranchStrip } from "./BranchStrip";
import { HeatmapCard } from "./HeatmapCard";
import { RecentTxCard } from "./RecentTxCard";
import type { ApiOwnerDashboard } from "@/lib/api/dashboard";

export function DashboardClient({
  data,
  locale,
}: {
  data: ApiOwnerDashboard;
  locale: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("dashboard");

  return (
    <div className="dash">
      {data.mixed_currency_warning && (
        <div className="dash-mixed-currency-warning" role="status">
          <AlertTriangle size={14} strokeWidth={1.5} />
          <span>{t("mixedCurrencyWarning")}</span>
        </div>
      )}

      <DashboardHeader
        week={data.week}
        vs_prev_week={data.vs_prev_week}
        leaderboard={data.leaderboard}
        locale={locale}
      />

      <KpiRow
        week={data.week}
        prev_week={data.prev_week}
        vs_prev_week={data.vs_prev_week}
        sparklines={data.sparklines}
        currency_code={data.currency_code}
        locale={locale}
      />

      <section className="dash-hero-row">
        <RevenueHeroChart
          revenue_30d={data.revenue_30d}
          weekDeltaPct={data.vs_prev_week.revenue_pct}
          currency_code={data.currency_code}
          locale={locale}
        />
        <AIInsightsRail insights={data.insights} locale={locale} />
      </section>

      <BranchStrip
        leaderboard={data.leaderboard}
        currency_code={data.currency_code}
        locale={locale}
      />

      <section className="dash-pair">
        <HeatmapCard heatmap={data.heatmap} locale={locale} />
        <RecentTxCard
          recent_transactions={data.recent_transactions}
          currency_code={data.currency_code}
          locale={locale}
        />
      </section>
    </div>
  );
}
