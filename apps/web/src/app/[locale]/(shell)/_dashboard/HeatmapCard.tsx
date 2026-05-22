"use client";

import { useTranslations } from "next-intl";

const HOURS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface HeatmapCardProps {
  heatmap: number[][];
  locale: string;
}

export function HeatmapCard({ heatmap, locale }: HeatmapCardProps) {
  const t = useTranslations("dashboard.heatmap");
  const tDays = useTranslations("dashboard.heatmap.days");
  const localeIsAr = locale === "ar";

  return (
    <div className="dash-card">
      <header className="dash-card-h">
        <div>
          <div className="dash-card-title">{t("title")}</div>
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {t("legend")}
        </span>
      </header>
      <div className="dash-heat-grid">
        <div />
        {HOURS.map((h, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9.5 }}>
            {h}
            {i < 4 ? (localeIsAr ? "ص" : "a") : localeIsAr ? "م" : "p"}
          </div>
        ))}
        {heatmap.map((cells, dow) => {
          const dayKey = DAY_KEYS[dow] ?? String(dow);
          return (
            <div key={dayKey} style={{ display: "contents" }}>
              <div style={{ fontSize: 11, alignSelf: "center" }}>
                {tDays(dayKey)}
              </div>
              {cells.map((v, i) => (
                <div
                  key={i}
                  className="dash-heat-cell"
                  title={`${tDays(dayKey)} · ${v.toFixed(2)}`}
                  style={{
                    background: `color-mix(in oklab, var(--accent) ${Math.round(
                      v * 100,
                    )}%, var(--bg-sunk))`,
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      <p className="dash-heat-caption">{t("body")}</p>
    </div>
  );
}
