"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { AIInsightCard } from "./AIInsightCard";
import type { ApiOwnerDashboardInsight } from "@/lib/api/dashboard";

const DISMISS_STORAGE_KEY = "madar.dashboard.dismissed_insights";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

type DismissMap = Record<string, string>;

function readDismissed(): DismissMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DismissMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function pruneExpired(map: DismissMap, now = Date.now()): DismissMap {
  const fresh: DismissMap = {};
  for (const [id, isoDate] of Object.entries(map)) {
    const ts = Date.parse(isoDate);
    if (Number.isFinite(ts) && now - ts < DISMISS_TTL_MS) {
      fresh[id] = isoDate;
    }
  }
  return fresh;
}

function writeDismissed(map: DismissMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota / privacy-mode failures — dismiss-state is best-effort.
  }
}

export function AIInsightsRail({
  insights,
  locale,
}: {
  insights: ApiOwnerDashboardInsight[];
  locale: string;
}) {
  const t = useTranslations("dashboard.insights.rail");

  // Hydrate dismiss-map from localStorage on mount; prune anything older
  // than 14 days while we're at it.
  const [dismissed, setDismissed] = useState<DismissMap>({});
  useEffect(() => {
    const pruned = pruneExpired(readDismissed());
    setDismissed(pruned);
    writeDismissed(pruned);
  }, []);

  const onDismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = { ...prev, [id]: new Date().toISOString() };
      writeDismissed(next);
      return next;
    });
  }, []);

  const visible = insights.filter((i) => !(i.id in dismissed)).slice(0, 4);

  return (
    <div className="dash-card dash-rail">
      <header>
        <Sparkles size={14} strokeWidth={1.5} style={{ color: "var(--accent)" }} />
        <span className="kicker" style={{ color: "var(--accent)" }}>
          {t("title")}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="dash-card-link">
          {t("askMadar")}
        </button>
      </header>
      <div>
        {visible.length === 0 ? (
          <p
            style={{
              color: "var(--ink-3)",
              fontSize: 13,
              padding: "18px 0",
              margin: 0,
            }}
          >
            {t("empty")}
          </p>
        ) : (
          visible.map((ins) => (
            <AIInsightCard
              key={ins.id}
              insight={ins}
              locale={locale}
              onDismiss={onDismiss}
            />
          ))
        )}
      </div>
    </div>
  );
}
