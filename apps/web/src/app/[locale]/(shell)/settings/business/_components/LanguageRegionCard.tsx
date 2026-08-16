"use client";

import { useTranslations } from "next-intl";
import {
  buildFormatLocale,
  formatDate,
  formatMoney,
  type DisplayPrefs,
  type Lang,
} from "@madar/ui";

/**
 * Numeral system and calendar, both display-only.
 *
 * The preview is the point of this card. "Arabic-Indic digits" is abstract;
 * `١٬٢٣٤٫٥٦ ج.م.` is not. It also surfaces the one combination that reads as
 * broken — English copy on a Hijri calendar renders "Rab. I 3, 1448 AH" —
 * before a tenant saves it rather than after.
 */
export function LanguageRegionCard({
  locale,
  arabicIndic,
  hijri,
  onChange,
}: {
  locale: Lang;
  arabicIndic: boolean;
  hijri: boolean;
  onChange: (patch: { use_arabic_indic_digits?: boolean; use_hijri_calendar?: boolean }) => void;
}) {
  const t = useTranslations("settings.business.languageRegion");

  // Preview the PENDING choice, not the saved one.
  const prefs: DisplayPrefs = {
    numerals: arabicIndic ? "arab" : "latn",
    calendar: hijri ? "islamic" : "gregory",
  };
  const tag = buildFormatLocale(locale, prefs);
  const sampleMoney = formatMoney(123456, "EGP", tag);
  const sampleDate = formatDate("2026-08-16T00:00:00Z", tag, "long");

  const row = (
    key: "digits" | "calendar",
    checked: boolean,
    onToggle: (v: boolean) => void,
  ) => (
    <label className="bz-field" style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        style={{ marginBlockStart: 3 }}
      />
      <span>
        <span className="bz-label" style={{ display: "block" }}>
          {t(`${key}.label`)}
        </span>
        <span className="bz-hint">{t(`${key}.hint`)}</span>
      </span>
    </label>
  );

  return (
    <section className="bz-card">
      <h2 className="bz-card-title">{t("title")}</h2>
      <p className="bz-hint" style={{ marginBlockEnd: "var(--space-3)" }}>
        {t("subtitle")}
      </p>

      {row("digits", arabicIndic, (v) => onChange({ use_arabic_indic_digits: v }))}
      {row("calendar", hijri, (v) => onChange({ use_hijri_calendar: v }))}

      <div
        style={{
          marginBlockStart: "var(--space-3)",
          padding: "var(--space-3)",
          background: "var(--bg-sunk)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius)",
        }}
      >
        <div className="bz-meta-key">{t("preview")}</div>
        <div
          className="tnum"
          style={{ fontSize: 15, marginBlockStart: "var(--space-1)", fontFamily: "var(--serif)" }}
        >
          {sampleMoney} · {sampleDate}
        </div>
      </div>
    </section>
  );
}
