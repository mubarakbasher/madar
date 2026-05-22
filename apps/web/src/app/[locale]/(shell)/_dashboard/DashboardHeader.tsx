"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type {
  ApiOwnerDashboardLeaderboardRow,
  ApiOwnerDashboardVsPrevWeek,
  ApiOwnerDashboardWeek,
} from "@/lib/api/dashboard";

interface DashboardHeaderProps {
  week: ApiOwnerDashboardWeek;
  vs_prev_week: ApiOwnerDashboardVsPrevWeek;
  leaderboard: ApiOwnerDashboardLeaderboardRow[];
  locale: string;
  onWhy?: () => void;
}

/**
 * Pick the top mover (largest |vs_prev_week_pct|) and split the leaderboard
 * into rich-text-ready parts. v1 keeps the rendering simple — one templated
 * sentence — but we still respect the design's editorial up/down accents.
 */
function pickTopMover(
  rows: ApiOwnerDashboardLeaderboardRow[],
  locale: string,
): { branchName: string; pct: number } | null {
  let best: ApiOwnerDashboardLeaderboardRow | null = null;
  let bestAbs = -Infinity;
  for (const row of rows) {
    if (row.vs_prev_week_pct === null) continue;
    const abs = Math.abs(row.vs_prev_week_pct);
    if (abs > bestAbs) {
      bestAbs = abs;
      best = row;
    }
  }
  if (!best || best.vs_prev_week_pct === null) return null;
  const name = locale === "ar"
    ? best.name_i18n?.ar ?? best.code
    : best.name_i18n?.en ?? best.code;
  return { branchName: name, pct: best.vs_prev_week_pct };
}

export function DashboardHeader({
  leaderboard,
  locale,
  onWhy,
}: DashboardHeaderProps) {
  const t = useTranslations("dashboard");
  const tH = useTranslations("dashboard.headline");
  const tA = useTranslations("dashboard.actions");

  const top = pickTopMover(leaderboard, locale);

  let headline: React.ReactNode;
  if (!top) {
    headline = tH("firstWeek");
  } else {
    const absPct = Math.abs(top.pct).toFixed(1);
    const accent = top.pct >= 0 ? "up" : "dn";
    headline = (
      <>
        {tH.rich(top.pct >= 0 ? "revenueUp" : "revenueDown", {
          pct: () => <em className={accent}>{absPct}%</em>,
          branch: () => <em className="acc">{top.branchName}</em>,
        })}
      </>
    );
  }

  return (
    <header className="dash-head">
      <div className="dash-head-meta">
        <span className="kicker">{t("kicker")}</span>
        <span className="dash-head-byline">
          {t.rich("byline", {
            brand: (chunks) => <b>{chunks}</b>,
          })}
        </span>
      </div>
      <h1 className="dash-headline">{headline}</h1>
      <div className="dash-head-actions">
        <button type="button" className="dash-btn" onClick={onWhy}>
          <Sparkles size={13} strokeWidth={1.5} />
          {tA("why")}
        </button>
        <button type="button" className="dash-btn">
          {tA("readFull")}
        </button>
        <button type="button" className="dash-btn dash-btn-ghost">
          {tA("skipWeek")}
        </button>
      </div>
    </header>
  );
}
