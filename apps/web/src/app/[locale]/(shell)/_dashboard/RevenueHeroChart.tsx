"use client";

import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown } from "lucide-react";
import { formatNumber, minorToMajor } from "@/lib/currency";
import type { ApiOwnerDashboardRevenuePoint } from "@/lib/api/dashboard";

interface RevenueHeroChartProps {
  revenue_30d: ApiOwnerDashboardRevenuePoint[];
  weekDeltaPct: number | null;
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

export function RevenueHeroChart({
  revenue_30d,
  weekDeltaPct,
  currency_code,
  locale,
}: RevenueHeroChartProps) {
  const t = useTranslations("dashboard.hero");
  const tKpi = useTranslations("dashboard.kpi");
  const cur = symbolFor(currency_code, locale);

  // Empty state: no points (brand-new tenant). Render the card chrome but
  // skip the SVG body.
  if (revenue_30d.length === 0) {
    return (
      <div className="dash-card">
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "var(--space-4)",
          }}
        >
          <div>
            <div className="kicker">{t("title")}</div>
            <div className="dash-hero-total">
              <span className="cur">{cur}</span>0
            </div>
          </div>
        </header>
        <p
          style={{
            color: "var(--ink-3)",
            fontSize: 13,
            margin: 0,
          }}
        >
          {t("empty")}
        </p>
      </div>
    );
  }

  // Series of display units (not cents) for the SVG. Round to whole units
  // for cleaner axis labels — the underlying cents are still in the data.
  const series = revenue_30d.map((p) => Math.round(minorToMajor(p.cents, currency_code)));

  const w = 720;
  const h = 280;
  const pad = 32;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  const pts = series.map(
    (v, i) => [pad + i * stepX, h - pad - ((v - min) / range) * (h - pad * 2)] as const,
  );
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const lastPt = pts[pts.length - 1]!;
  const firstPt = pts[0]!;
  const area = `${path} L${lastPt[0]},${h - pad} L${firstPt[0]},${h - pad} Z`;
  const last = series[series.length - 1]!;

  const hasDelta = weekDeltaPct !== null && Number.isFinite(weekDeltaPct);
  const deltaUp = hasDelta && (weekDeltaPct as number) >= 0;

  return (
    <div className="dash-card">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "var(--space-4)",
        }}
      >
        <div>
          <div className="kicker">{t("title")}</div>
          <div className="dash-hero-total">
            <span className="cur">{cur}</span>
            {formatNumber(last, locale)}
            {hasDelta && (
              <span
                className={`delta ${deltaUp ? "up" : "dn"}`}
                style={{ marginInlineStart: "var(--space-3)", fontSize: 14 }}
              >
                {deltaUp ? (
                  <ArrowUp size={11} strokeWidth={1.75} />
                ) : (
                  <ArrowDown size={11} strokeWidth={1.75} />
                )}
                {Math.abs(weekDeltaPct as number).toFixed(1)}%
                <span className="delta-sub">{tKpi("vsLastWeek")}</span>
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              marginTop: "var(--space-1)",
            }}
          >
            {t("branchAll")}
          </div>
        </div>
      </header>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        style={{ display: "block" }}
        role="img"
        aria-label={t("title")}
      >
        <defs>
          <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={w - pad}
            y1={pad + g * (h - pad * 2)}
            y2={pad + g * (h - pad * 2)}
            stroke="var(--rule)"
            strokeDasharray="2 4"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#revfill)" />
        <path
          d={path}
          stroke="var(--accent)"
          strokeWidth="1.8"
          fill="none"
          strokeLinejoin="round"
        />
        <circle
          cx={lastPt[0]}
          cy={lastPt[1]}
          r="4"
          fill="var(--accent)"
          stroke="var(--bg-elev)"
          strokeWidth="2"
        />
        {[0, 7, 14, 21, 29].map((i) => {
          const pt = pts[i];
          if (!pt) return null;
          return (
            <text
              key={i}
              x={pt[0]}
              y={h - 10}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ink-3)"
              fontFamily="var(--sans)"
            >
              {`${30 - i}d`}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
