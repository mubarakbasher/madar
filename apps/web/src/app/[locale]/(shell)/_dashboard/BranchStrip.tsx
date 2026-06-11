"use client";

import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown } from "lucide-react";
import { formatNumberShort, minorToMajor } from "@/lib/currency";
import type { ApiOwnerDashboardLeaderboardRow } from "@/lib/api/dashboard";

interface BranchStripProps {
  leaderboard: ApiOwnerDashboardLeaderboardRow[];
  currency_code: string;
  locale: string;
}

function symbolFor(currency: string, locale: string): string {
  if (currency === "EGP") return locale === "ar" ? "ج.م" : "£";
  try {
    const parts = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

export function BranchStrip({
  leaderboard,
  currency_code,
  locale,
}: BranchStripProps) {
  const t = useTranslations("dashboard.leaderboard");
  const cur = symbolFor(currency_code, locale);

  // API returns leaderboard already DESC by revenue. Coerce the bigint string
  // once for the bar-fill math, keep it as a number for compact formatting.
  const rows = leaderboard.map((row) => ({
    ...row,
    revenue_units: Math.round(minorToMajor(row.revenue_cents, currency_code)),
  }));
  const max = rows.length > 0 ? Math.max(...rows.map((r) => r.revenue_units)) : 0;

  if (rows.length === 0) return null;

  return (
    <section className="dash-card" style={{ marginBottom: 16 }}>
      <header className="dash-card-h">
        <div>
          <div className="dash-card-title">{t("title")}</div>
        </div>
        <button type="button" className="dash-card-link">
          {t("allLink")}
        </button>
      </header>
      <div
        className="dash-strip"
        style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}
      >
        {rows.map((b, i) => {
          const width = max > 0 ? (b.revenue_units / max) * 100 : 0;
          const hasDelta =
            b.vs_prev_week_pct !== null && Number.isFinite(b.vs_prev_week_pct);
          const up = hasDelta && (b.vs_prev_week_pct as number) >= 0;
          const name = locale === "ar"
            ? b.name_i18n?.ar ?? b.code
            : b.name_i18n?.en ?? b.code;
          return (
            <div key={b.branch_id} className="dash-strip-col">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <span className="dash-strip-rank">
                  {t("rank", { n: i + 1 })}
                </span>
                <strong style={{ fontSize: 13 }}>{name}</strong>
              </div>
              <div className="dash-strip-total">
                <span className="cur">{cur}</span>
                {formatNumberShort(b.revenue_units, locale)}
              </div>
              <div className="dash-strip-bar">
                <div
                  className="dash-strip-bar-fill"
                  style={{
                    width: `${width}%`,
                    background: i === 0 ? "var(--accent)" : "var(--ink-3)",
                  }}
                />
              </div>
              {hasDelta ? (
                <div
                  className={`delta ${up ? "up" : "dn"}`}
                  style={{ marginTop: 6, fontSize: 11.5 }}
                >
                  {up ? (
                    <ArrowUp size={11} strokeWidth={1.75} />
                  ) : (
                    <ArrowDown size={11} strokeWidth={1.75} />
                  )}
                  {Math.abs(b.vs_prev_week_pct as number).toFixed(1)}%
                </div>
              ) : (
                <div
                  className="delta"
                  style={{
                    marginTop: 6,
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                  }}
                >
                  —
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
