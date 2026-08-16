"use client";

import { useTranslations } from "next-intl";
import { Clock, LogOut } from "lucide-react";
import { useFormat } from "@/lib/i18n/format";

// The old implementation hardcoded `${h}h ${m}m` for the h>0 branch with no
// Arabic path at all, so Arabic cashiers read a literal "12h 47m" — English
// unit letters and Western digits — for all but the first hour of a shift.
function elapsedMinutes(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
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
  const f = useFormat();
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
      <Clock size={12} strokeWidth={1.5} />
      <span>
        {t("openFor", { duration: f.duration(elapsedMinutes(openedAt)) })} ·{" "}
        {t("float", { amount: f.money(openingFloatCents, currency) })}
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
        <LogOut size={12} strokeWidth={1.5} />
        {t("end")}
      </button>
    </div>
  );
}
