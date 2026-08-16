// Locale-aware date/time formatting shared by both apps.
//
// Before this existed, 42 call sites hand-rolled `new Intl.DateTimeFormat(...)`
// across four different conventions — "en-US", "en-GB", "en-EG", and no locale
// at all — so the same timestamp rendered three ways on three screens, and the
// Arabic UI showed "Aug 18, 2026" on the billing page.
//
// Pass a tag from buildFormatLocale(); never a bare "en"/"ar".

export type DateStyle = "short" | "medium" | "long";

type Input = Date | string | number;

function toDate(value: Input): Date {
  return value instanceof Date ? value : new Date(value);
}

// Constructing an Intl formatter is expensive relative to formatting with one,
// and the inventory table renders 500 rows. Keyed on the full tag + options, so
// it is safe to share across concurrent SSR requests: it holds Intl objects
// only, never tenant data.
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

export function formatDate(value: Input, locale: string, style: DateStyle = "medium"): string {
  return formatter(locale, { dateStyle: style }).format(toDate(value));
}

export function formatTime(value: Input, locale: string): string {
  return formatter(locale, { timeStyle: "short" }).format(toDate(value));
}

export function formatDateTime(
  value: Input,
  locale: string,
  style: DateStyle = "medium",
): string {
  return formatter(locale, { dateStyle: style, timeStyle: "short" }).format(toDate(value));
}

/** Month + year only — statement headers, period labels. */
export function formatMonthYear(value: Input, locale: string): string {
  return formatter(locale, { year: "numeric", month: "long" }).format(toDate(value));
}

const RELATIVE_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** "3 hours ago" / "قبل ٣ ساعات". `now` is injectable so tests aren't clock-dependent. */
export function formatRelative(value: Input, locale: string, now: Input = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  let duration = (toDate(value).getTime() - toDate(now).getTime()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "year");
}

/**
 * Duration as a localized "2h 15m" / "٢ س ١٥ د".
 *
 * The POS shift chip built this with a template literal whose `h > 0` branch
 * had no Arabic path at all, so Arabic cashiers saw a literal "12h 47m".
 * `unitDisplay: "narrow"` gives the right abbreviation per locale.
 */
export function formatDuration(totalMinutes: number, locale: string): string {
  const unit = (value: number, u: "hour" | "minute"): string =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: u,
      unitDisplay: "narrow",
      maximumFractionDigits: 0,
    }).format(value);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return hours > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(minutes, "minute");
}
