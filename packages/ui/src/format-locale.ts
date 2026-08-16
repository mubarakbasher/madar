// The single place a BCP-47 formatting tag is assembled.
//
// Two axes, deliberately kept apart:
//
//   language  "en" | "ar"  — from the URL segment. Drives routing, <html dir>,
//                            fonts, and which side of a name_i18n pair to show.
//   display   prefs        — from the tenants row. Drives ONLY how numbers and
//                            dates render.
//
// They must not be conflated. next-intl derives every URL prefix from
// useLocale() (Link, useRouter and usePathname all do), so putting a `-u-`
// extension into the routing locale turns every href into /ar-EG-u-nu-arab/…
// and stops usePathname() unprefixing. The tag below therefore never leaves
// this module's callers — it is never a prop, never a URL, never useLocale().

export type Lang = "en" | "ar";
export type NumeralSystem = "latn" | "arab";
export type CalendarSystem = "gregory" | "islamic";

export interface DisplayPrefs {
  numerals: NumeralSystem;
  calendar: CalendarSystem;
}

/** Western digits, Gregorian calendar — the documented product defaults
 *  (docs/i18n-guide.md §5.1, §5.2) for every locale, not just English. */
export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  numerals: "latn",
  calendar: "gregory",
};

const REGION: Record<Lang, string> = { en: "en-EG", ar: "ar-EG" };

/**
 * Build the Intl tag for a language + display preference.
 *
 * Assembled from closed unions on purpose. An unrecognised `-u-` subtag is
 * dropped silently by Intl and the region default wins — `ar-EG-u-nu-bogus`
 * formats 5 as `٥`, which is exactly the bug this module exists to prevent.
 * A typo here would be invisible at runtime, so `format-locale.spec.ts`
 * asserts resolvedOptions() rather than the rendered string.
 */
export function buildFormatLocale(lang: Lang, prefs?: DisplayPrefs): string {
  const p = prefs ?? DEFAULT_DISPLAY_PREFS;
  const ext: string[] = [];

  // Arabic-Indic digits are meaningless outside Arabic script — an English UI
  // asking for `arab` would render `١٢٣` under Latin copy. The calendar is not
  // script-bound, though: an English-language Gulf tenant on Hijri is a real
  // configuration, so `islamic` applies to both languages.
  if (lang === "ar" && p.numerals === "arab") ext.push("nu-arab");
  else if (lang === "ar") ext.push("nu-latn");

  if (p.calendar === "islamic") ext.push("ca-islamic");

  const base = REGION[lang];
  return ext.length > 0 ? `${base}-u-${ext.join("-")}` : base;
}

/** Recover the language from a tag, for `dir` / font / name_i18n decisions. */
export function langOf(tag: string): Lang {
  return tag.toLowerCase().startsWith("ar") ? "ar" : "en";
}

// ─── cookie ──────────────────────────────────────────────────────────────
//
// The preference lives in the DB and reaches the client through the auth
// store, which is null on first render. A cookie mirrors it so the server can
// resolve before hydration — and, more importantly, so an offline POS session
// (where /v1/auth/refresh fails and `tenant` stays null for the whole shift)
// still renders the tenant's chosen numerals.

export const DISPLAY_COOKIE = "madar_display";

/** `v1.<tenantId>.<numerals>.<calendar>` */
export function encodeDisplayPrefs(prefs: DisplayPrefs, tenantId: string): string {
  return `v1.${tenantId}.${prefs.numerals}.${prefs.calendar}`;
}

/**
 * Decode, falling back to the defaults on anything unexpected.
 *
 * When `tenantId` is supplied and does not match the stamp, the cookie belongs
 * to a different tenant on a shared device — return the defaults rather than
 * that tenant's preference. Pass `undefined` (server-side, before the session
 * is known) to accept whatever is stamped; the value is display-only, so the
 * worst case is one wrong-numerals paint before the store corrects it.
 */
export function decodeDisplayPrefs(
  raw: string | undefined | null,
  tenantId?: string | null,
): DisplayPrefs {
  if (!raw) return DEFAULT_DISPLAY_PREFS;
  const parts = raw.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return DEFAULT_DISPLAY_PREFS;
  const [, stampedTenant, numerals, calendar] = parts;
  if (tenantId != null && stampedTenant !== tenantId) return DEFAULT_DISPLAY_PREFS;
  return {
    numerals: numerals === "arab" ? "arab" : "latn",
    calendar: calendar === "islamic" ? "islamic" : "gregory",
  };
}
