"use client";

import { useTranslations } from "next-intl";
import type {
  ApiOwnerDashboardInsight,
  ApiOwnerDashboardInsightKind,
} from "@/lib/api/dashboard";

// Map each API insight kind to an accent token + icon hint. Kinds and design
// choices are independent of the legacy `reorder | anomaly | …` enum.
const KIND_COLOR: Record<ApiOwnerDashboardInsightKind, string> = {
  branch_decline: "var(--rose)",
  concentration: "var(--amber)",
  stale_payment_proof: "var(--rose)",
  low_stock_critical: "var(--accent)",
  growth_winner: "var(--sage)",
  week_recap: "var(--ink-2)",
};

export function AIInsightCard({
  insight,
  locale,
  onDismiss,
}: {
  insight: ApiOwnerDashboardInsight;
  locale: string;
  onDismiss: (id: string) => void;
}) {
  const t = useTranslations("dashboard.insights");
  const tU = useTranslations("dashboard.insights.urgency");
  const isAr = locale === "ar";

  const headline = isAr ? insight.headline_i18n.ar : insight.headline_i18n.en;
  const body = isAr ? insight.body_i18n.ar : insight.body_i18n.en;
  const dot = KIND_COLOR[insight.kind] ?? "var(--ink-2)";

  return (
    <article
      className="dash-insight"
      data-urgency={insight.urgency}
      data-kind={insight.kind}
    >
      <header className="dash-insight-head">
        <span className="dash-insight-dot" style={{ background: dot }} />
        <span className="kicker">{tU(insight.urgency)}</span>
        <span className="dash-insight-conf">
          {t("confidence", { percent: Math.round(insight.confidence * 100) })}
        </span>
      </header>
      <h4 className="dash-insight-headline">{headline}</h4>
      <p className="dash-insight-body">{body}</p>
      <div className="dash-insight-actions">
        {insight.actions.map((a, i) => {
          const label = isAr ? a.label_i18n.ar : a.label_i18n.en;
          // Anchor-style actions: link out if href is provided; otherwise
          // render as a non-functional button placeholder.
          return (
            <a
              key={`${insight.id}-${i}`}
              className={i === 0 ? "dash-btn dash-btn-primary" : "dash-btn"}
              href={a.href || "#"}
            >
              {label}
            </a>
          );
        })}
        <button
          type="button"
          className="dash-btn dash-btn-ghost"
          onClick={() => onDismiss(insight.id)}
        >
          {t("rail.dismiss")}
        </button>
      </div>
    </article>
  );
}
