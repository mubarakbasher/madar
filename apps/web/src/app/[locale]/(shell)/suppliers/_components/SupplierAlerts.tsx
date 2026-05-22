"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { ApiSupplierStats } from "@/lib/api/suppliers";

/**
 * Opt-in: only renders when fill_rate_pct or on_time_pct is non-null AND below 80.
 * Quiet rose-tinted card.
 */
export function SupplierAlerts({
  stats,
  supplierName,
  onReview,
}: {
  stats: ApiSupplierStats;
  supplierName: string;
  onReview?: () => void;
}) {
  const t = useTranslations("suppliers.alerts");

  const fillBad = stats.fill_rate_pct !== null && stats.fill_rate_pct < 80;
  const onTimeBad = stats.on_time_pct !== null && stats.on_time_pct < 80;
  if (!fillBad && !onTimeBad) return null;

  return (
    <div className="sup-alert" role="status">
      <Sparkles size={16} strokeWidth={1.5} className="sup-alert-icon" />
      <div className="sup-alert-body">
        <strong>{t("title")}.</strong> {t("body", { name: supplierName })}
      </div>
      {onReview && (
        <button type="button" className="sup-btn sup-btn-sm" onClick={onReview}>
          {t("reviewCta")}
        </button>
      )}
    </div>
  );
}
