"use client";

import { useTranslations } from "next-intl";
import { Clock, LogOut } from "lucide-react";
import { formatMoney } from "@/lib/currency";

function fmtDuration(iso: string, locale: "en" | "ar"): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return locale === "ar" ? `${m} د` : `${m}m`;
}

export function ShiftChip({
  openingFloatCents,
  openedAt,
  currency,
  locale,
  onEnd,
}: {
  openingFloatCents: string;
  openedAt: string;
  currency: string;
  locale: "en" | "ar";
  onEnd: () => void;
}) {
  const t = useTranslations("pos.shift.chip");
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "var(--space-1) 10px var(--space-1) var(--space-3)",
        background: "color-mix(in oklab, var(--accent) 10%, var(--bg-elev))",
        border: "1px solid color-mix(in oklab, var(--accent) 30%, var(--rule))",
        borderRadius: "var(--radius-full)",
        fontSize: 12,
        color: "var(--ink-2)",
      }}
    >
      <Clock size={12} strokeWidth={1.75} />
      <span>
        {t("openFor", { duration: fmtDuration(openedAt, locale) })} ·{" "}
        {t("float", { amount: formatMoney(openingFloatCents, currency, locale) })}
      </span>
      <button
        type="button"
        onClick={onEnd}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--rose)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-1)",
          fontSize: 12,
          padding: "2px 6px",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <LogOut size={12} strokeWidth={1.75} />
        {t("end")}
      </button>
    </div>
  );
}
