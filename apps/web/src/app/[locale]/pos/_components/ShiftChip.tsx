"use client";

import { useTranslations } from "next-intl";
import { Clock, LogOut } from "lucide-react";

function fmtDuration(iso: string, locale: "en" | "ar"): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return locale === "ar" ? `${m} د` : `${m}m`;
}

function fmtCurrencyMinor(amountMinor: string, currency: string, locale: "en" | "ar"): string {
  const major = Number(amountMinor) / 100;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(major);
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
        padding: "4px 10px 4px 12px",
        background: "color-mix(in oklab, var(--accent) 10%, var(--bg-elev))",
        border: "1px solid color-mix(in oklab, var(--accent) 30%, var(--rule))",
        borderRadius: 999,
        fontSize: 12,
        color: "var(--ink-2)",
      }}
    >
      <Clock size={12} strokeWidth={1.75} />
      <span>
        {t("openFor", { duration: fmtDuration(openedAt, locale) })} ·{" "}
        {t("float", { amount: fmtCurrencyMinor(openingFloatCents, currency, locale) })}
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
          gap: 4,
          fontSize: 12,
          padding: "2px 6px",
          borderRadius: 6,
        }}
      >
        <LogOut size={12} strokeWidth={1.75} />
        {t("end")}
      </button>
    </div>
  );
}
