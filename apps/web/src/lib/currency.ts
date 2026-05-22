// Locale-aware money formatting. Never hand-format money.
// Per CLAUDE.md: money will eventually live as BigInt cents + sibling currency_code.
// For the mock-data slice we accept plain numbers; the public signature stays compatible.

export function formatCurrency(value: number, currency = "EGP", locale = "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, locale = "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG").format(value);
}

// Compact ("181.3k", "1.2M") — for sparkline / branch switcher summaries.
export function formatNumberShort(value: number, locale = "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
