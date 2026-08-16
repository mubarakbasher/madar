"use client";

// The tenant app's single formatting entry point.
//
// Components call `useFormat()` and never touch Intl, next-intl's formatter,
// or the raw @madar/ui helpers. That invariant is what keeps one screen on one
// numeral system: the tenant's display preference has to reach money, counts,
// dates and durations identically, and it cannot travel through next-intl's
// locale (see packages/ui/src/format-locale.ts for why).
//
// The provider DERIVES its value from the auth store rather than syncing into
// state. First client render has `tenant === null`, so it falls back to the
// same cookie-resolved prefs the server used — identical markup, no hydration
// mismatch, no effect, no flash. When bootstrap lands the tenant, it flips once.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  buildFormatLocale,
  currencySymbol as uiCurrencySymbol,
  formatDate as uiFormatDate,
  formatDateTime as uiFormatDateTime,
  formatDuration as uiFormatDuration,
  formatMoney as uiFormatMoney,
  formatMonthYear as uiFormatMonthYear,
  formatNumber as uiFormatNumber,
  formatNumberShort as uiFormatNumberShort,
  formatRelative as uiFormatRelative,
  formatTime as uiFormatTime,
  DEFAULT_DISPLAY_PREFS,
  type DateStyle,
  type DisplayPrefs,
  type Lang,
} from "@madar/ui";
import { useAuthStore } from "@/lib/auth/store";
import { prefsFromTenant } from "./display-prefs";

export interface Formatter {
  /** Resolved BCP-47 tag. Escape hatch for one-off Intl options. */
  readonly locale: string;
  readonly lang: Lang;
  readonly prefs: DisplayPrefs;

  /** Integer minor units → "1,234.50 ج.م." */
  money(
    minor: bigint | number | string,
    currencyCode: string,
    digits?: { min?: number; max?: number },
  ): string;
  /** The symbol alone, for layouts that style it separately (POS tiles, KPIs). */
  currencySymbol(currencyCode: string): string;
  number(value: number): string;
  numberShort(value: number): string;
  /** Emits the Arabic percent sign in Arabic, so `78%` renders `٧٨٪` and not `%٧٨`. */
  percent(value: number, fractionDigits?: number): string;

  date(value: Date | string | number, style?: DateStyle): string;
  time(value: Date | string | number): string;
  dateTime(value: Date | string | number, style?: DateStyle): string;
  monthYear(value: Date | string | number): string;
  relative(value: Date | string | number, now?: Date | string | number): string;
  /** Minutes → "2h 15m" / "٢ س ١٥ د". */
  duration(totalMinutes: number): string;

  /**
   * Gregorian + Western, always. For values that must NOT follow the toggles:
   * export filenames, audit stamps, and anything a machine reads back.
   * Note `<input type="date">` values and API `from`/`to` params should use
   * lib/local-date.ts instead — they are ISO strings, not display text.
   */
  gregorianDate(value: Date | string | number, style?: DateStyle): string;
}

function build(lang: Lang, prefs: DisplayPrefs): Formatter {
  const locale = buildFormatLocale(lang, prefs);
  const gregorian = buildFormatLocale(lang, { ...prefs, calendar: "gregory" });

  return {
    locale,
    lang,
    prefs,
    money: (minor, currencyCode, digits) => uiFormatMoney(minor, currencyCode, locale, digits),
    currencySymbol: (currencyCode) => uiCurrencySymbol(currencyCode, locale),
    number: (value) => uiFormatNumber(value, locale),
    numberShort: (value) => uiFormatNumberShort(value, locale),
    percent: (value, fractionDigits = 0) =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value),
    date: (value, style) => uiFormatDate(value, locale, style),
    time: (value) => uiFormatTime(value, locale),
    dateTime: (value, style) => uiFormatDateTime(value, locale, style),
    monthYear: (value) => uiFormatMonthYear(value, locale),
    relative: (value, now) => uiFormatRelative(value, locale, now),
    duration: (totalMinutes) => uiFormatDuration(totalMinutes, locale),
    gregorianDate: (value, style) => uiFormatDate(value, gregorian, style),
  };
}

const FormatContext = createContext<Formatter | null>(null);

export function FormatProvider({
  lang,
  initialPrefs,
  children,
}: {
  lang: Lang;
  /** Server-resolved from the madar_display cookie. */
  initialPrefs: DisplayPrefs;
  children: ReactNode;
}) {
  const tenant = useAuthStore((s) => s.tenant);
  // Derived, not synced: no effect, so SSR and first client render agree.
  const prefs = tenant ? prefsFromTenant(tenant) : initialPrefs;
  const value = useMemo(
    () => build(lang, prefs),
    [lang, prefs.numerals, prefs.calendar], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

export function useFormat(): Formatter {
  const ctx = useContext(FormatContext);
  if (!ctx) {
    // Every tenant route is inside [locale]/layout.tsx, so this only fires for
    // a component mounted outside the provider — a wiring mistake, not a state.
    throw new Error("useFormat() must be used inside <FormatProvider>");
  }
  return ctx;
}

/** Typed convenience over next-intl's useLocale(), which returns a bare string. */
export function useLang(): Lang {
  return useFormat().lang;
}

/**
 * Non-React escape hatch for module-scope helpers and offline adapters that
 * cannot use a hook. Prefer `useFormat()` everywhere else — this reads the
 * store directly and will not re-render on preference changes.
 */
export function formatterFor(lang: Lang): Formatter {
  const tenant = useAuthStore.getState().tenant;
  return build(lang, tenant ? prefsFromTenant(tenant) : DEFAULT_DISPLAY_PREFS);
}
