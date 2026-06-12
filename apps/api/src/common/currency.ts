/**
 * Currency minor-unit handling (CLAUDE.md: money = integer cents in BigInt +
 * sibling currency_code; currencies without 2 minor units use this lookup).
 * Mirrored in apps/web/src/lib/currency.ts — keep the two maps in sync.
 */
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

/** Integer minor units → major units as a number (display only, never math). */
export function minorToMajor(amount: bigint | number | string, currencyCode: string): number {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  const divisor = 10 ** currencyMinorUnits(currencyCode);
  return n / divisor;
}

/**
 * Exact decimal string from integer minor units (no float, no locale) — for
 * CSV/PDF exports. "1500" KWD → "1.500"; "1000" JPY → "1000".
 */
export function minorToDecimalString(amount: bigint | string, currencyCode: string): string {
  const digits = currencyMinorUnits(currencyCode);
  const big = typeof amount === "bigint" ? amount : BigInt(amount);
  const neg = big < 0n;
  const abs = neg ? -big : big;
  if (digits === 0) return `${neg ? "-" : ""}${abs.toString()}`;
  const div = 10n ** BigInt(digits);
  return `${neg ? "-" : ""}${(abs / div).toString()}.${(abs % div)
    .toString()
    .padStart(digits, "0")}`;
}

/** Locale-aware money string from integer minor units. */
export function formatMoney(
  amount: bigint | number | string,
  currencyCode: string,
  locale: string = "en",
): string {
  const digits = currencyMinorUnits(currencyCode);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToMajor(amount, currencyCode));
}
