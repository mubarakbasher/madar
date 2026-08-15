// Locale-aware money formatting shared by both apps. Never hand-format money,
// never hardcode /100: minor-unit counts vary by currency (KWD=3, JPY=0).
// The MINOR_UNITS map is mirrored in apps/api/src/common/currency.ts — keep
// the two in sync.

const MINOR_UNITS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

export function currencyMinorUnits(currencyCode: string): number {
  return MINOR_UNITS[currencyCode.toUpperCase()] ?? 2;
}

/** Integer minor units (cents/fils/…) → major units. Display only, never math. */
export function minorToMajor(amount: bigint | number | string, currencyCode: string): number {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  return n / 10 ** currencyMinorUnits(currencyCode);
}

/** Major-unit user input → integer minor units, rounded half-up. */
export function majorToMinor(value: number, currencyCode: string): number {
  return Math.round(value * 10 ** currencyMinorUnits(currencyCode));
}

/** Bare "en"/"ar" map to the tenant default region; full BCP-47 tags
 *  (e.g. admin's "en-US", or an opted-in tenant's "ar-EG-u-nu-arab") pass
 *  through unchanged.
 *
 *  The `-u-nu-latn` on Arabic is load-bearing. Western digits are the product
 *  default for every locale (docs/i18n-guide.md §5.1), and next-intl formats
 *  through the bare tag "ar", which CLDR already resolves to `latn`. Plain
 *  "ar-EG" would resolve to `arab` purely as a side effect of naming a region
 *  — which is how the app ended up rendering `٢٢ منتج` next to `عرض 22 من 22`
 *  on the same screen. The region still buys us `ج.م.` and Arabic month
 *  names; only the digits are pinned. */
function intlLocale(locale: string): string {
  if (locale === "ar") return "ar-EG-u-nu-latn";
  if (locale === "en") return "en-EG";
  return locale;
}

/** Format integer minor units as a money string with the currency's real
 *  precision. `digits` overrides the fraction-digit bounds for compact
 *  displays (e.g. whole-unit KPI cards use { min: 0, max: 0 }). */
export function formatMoney(
  amount: bigint | number | string,
  currencyCode: string,
  locale = "en",
  digits?: { min?: number; max?: number },
): string {
  const currencyDigits = currencyMinorUnits(currencyCode);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: digits?.min ?? currencyDigits,
    maximumFractionDigits: digits?.max ?? currencyDigits,
  }).format(minorToMajor(amount, currencyCode));
}

/**
 * Format a MAJOR-unit number (legacy signature — prefer formatMoney for cent
 * amounts). Uses the currency's true precision instead of truncating to 0.
 */
export function formatCurrency(value: number, currency = "EGP", locale = "en"): string {
  const digits = currencyMinorUnits(currency);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * The currency's symbol on its own, for layouts that set the symbol in a
 * separate (usually smaller) element from the amount — POS tiles, KPI cards.
 *
 * Prefer `formatMoney` when the amount and symbol can live in one string. This
 * exists so those split layouts stop hand-rolling `currency === "EGP" ? "£"`,
 * which is what rendered Egyptian pounds as sterling across the tenant app.
 */
export function currencySymbol(currencyCode: string, locale = "en"): string {
  try {
    const parts = new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currencyCode;
  } catch {
    // Unknown/malformed code — show the code itself rather than a wrong glyph.
    return currencyCode;
  }
}

export function formatNumber(value: number, locale = "en"): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

// Compact ("181.3k", "1.2M") — for sparkline / branch switcher summaries.
export function formatNumberShort(value: number, locale = "en"): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
