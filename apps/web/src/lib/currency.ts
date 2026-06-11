// Locale-aware money formatting. Never hand-format money, never hardcode /100:
// minor-unit counts vary by currency (KWD=3, JPY=0). The MINOR_UNITS map is
// mirrored in apps/api/src/common/currency.ts — keep the two in sync.

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

function intlLocale(locale: string): string {
  return locale === "ar" ? "ar-EG" : "en-EG";
}

/** Format integer minor units as a money string with the currency's real precision. */
export function formatMoney(
  amount: bigint | number | string,
  currencyCode: string,
  locale = "en",
): string {
  const digits = currencyMinorUnits(currencyCode);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
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
