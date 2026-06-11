// Calendar-day helpers for report date-range presets. These intentionally use
// the user's LOCAL calendar: `toISOString().slice(0,10)` returns the UTC day,
// which near midnight in UTC+ locales (Egypt, Gulf) resolves "today" to
// yesterday and shifts every preset by one day. Storage stays ISO-UTC — this
// only affects which calendar day the user means by "today"/"this month".

/** YYYY-MM-DD of the LOCAL calendar day for `d`. */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Days back from `d` (local), as a new Date. */
export function localDaysAgo(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - days);
  return out;
}

/** Monday of the local week containing `d`. */
export function localStartOfWeek(d: Date): Date {
  const out = new Date(d);
  const isoDow = (out.getDay() + 6) % 7; // Mon=0
  out.setDate(out.getDate() - isoDow);
  return out;
}

/** First day of the local month containing `d`. */
export function localStartOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** January 1st of the local year containing `d`. */
export function localStartOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}
