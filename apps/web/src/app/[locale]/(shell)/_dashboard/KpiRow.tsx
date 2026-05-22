"use client";

import { useTranslations } from "next-intl";
import { KPICard } from "./KPICard";
import { formatNumber } from "@/lib/currency";
import type {
  ApiOwnerDashboardPrevWeek,
  ApiOwnerDashboardSparklines,
  ApiOwnerDashboardVsPrevWeek,
  ApiOwnerDashboardWeek,
} from "@/lib/api/dashboard";

interface KpiRowProps {
  week: ApiOwnerDashboardWeek;
  prev_week: ApiOwnerDashboardPrevWeek;
  vs_prev_week: ApiOwnerDashboardVsPrevWeek;
  sparklines: ApiOwnerDashboardSparklines;
  currency_code: string;
  locale: string;
}

// Cents → display units. Money is `bigint` cents on the server, serialized as
// a numeric string; coerce here for the formatter (assumes < 2^53 cents).
function centsToUnits(cents: string | number): number {
  const n = typeof cents === "string" ? Number(cents) : cents;
  return Math.round(n / 100);
}

function symbolFor(currency: string, locale: string): string {
  if (currency === "EGP") return locale === "ar" ? "ج.م" : "£";
  // Best-effort symbol for other currencies via Intl.NumberFormat. Falls back
  // to the ISO code on environments without `formatToParts`.
  try {
    const parts = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency");
    return sym?.value ?? currency;
  } catch {
    return currency;
  }
}

export function KpiRow({
  week,
  sparklines,
  vs_prev_week,
  currency_code,
  locale,
}: KpiRowProps) {
  const t = useTranslations("dashboard.kpi");
  const cur = symbolFor(currency_code, locale);

  const revenueSpark = sparklines.revenue_cents.map(centsToUnits);
  const grossSpark = sparklines.gross_profit_cents.map(centsToUnits);
  const txSpark = sparklines.transactions;

  return (
    <section className="dash-kpi-row">
      <KPICard
        label={t("revenueLabel")}
        value={formatNumber(centsToUnits(week.revenue_cents), locale)}
        unit={cur}
        delta={vs_prev_week.revenue_pct}
        deltaLabel={t("vsLastWeek")}
        spark={revenueSpark}
      />
      <KPICard
        label={t("grossProfitLabel")}
        value={formatNumber(centsToUnits(week.gross_profit_cents), locale)}
        unit={cur}
        delta={vs_prev_week.gross_profit_pct}
        deltaLabel={t("vsLastWeek")}
        spark={grossSpark}
      />
      <KPICard
        label={t("transactionsLabel")}
        value={formatNumber(week.transactions, locale)}
        delta={vs_prev_week.transactions_pct}
        deltaLabel={t("vsLastWeek")}
        spark={txSpark}
      />
    </section>
  );
}
