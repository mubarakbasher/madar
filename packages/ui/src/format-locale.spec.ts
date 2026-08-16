import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_PREFS,
  buildFormatLocale,
  decodeDisplayPrefs,
  encodeDisplayPrefs,
  langOf,
  type DisplayPrefs,
  type Lang,
} from "./format-locale";
import { formatDate, formatDuration } from "./datetime";

const ALL_PREFS: DisplayPrefs[] = [
  { numerals: "latn", calendar: "gregory" },
  { numerals: "latn", calendar: "islamic" },
  { numerals: "arab", calendar: "gregory" },
  { numerals: "arab", calendar: "islamic" },
];

// These assert resolvedOptions(), not rendered strings, and that is the whole
// point. Intl DROPS an unrecognised -u- subtag and falls back to the region
// default: `ar-EG-u-nu-bogus` formats 5 as `٥`, not as an error. A typo in
// buildFormatLocale would therefore be invisible in every string-comparison
// test while silently restoring the mixed-numeral bug.
describe("buildFormatLocale resolves the system it asks for", () => {
  for (const lang of ["en", "ar"] as Lang[]) {
    for (const prefs of ALL_PREFS) {
      const label = `${lang} + ${prefs.numerals} + ${prefs.calendar}`;

      it(`${label}: numbering system resolves as intended`, () => {
        const tag = buildFormatLocale(lang, prefs);
        const resolved = new Intl.NumberFormat(tag).resolvedOptions().numberingSystem;
        // Arabic-Indic is script-bound: an English UI never gets `arab`.
        const expected = lang === "ar" && prefs.numerals === "arab" ? "arab" : "latn";
        expect(resolved).toBe(expected);
      });

      it(`${label}: calendar resolves as intended`, () => {
        const tag = buildFormatLocale(lang, prefs);
        const resolved = new Intl.DateTimeFormat(tag).resolvedOptions().calendar;
        expect(resolved).toBe(prefs.calendar === "islamic" ? "islamic" : "gregory");
      });
    }
  }

  it("proves the failure mode these tests exist for", () => {
    // A malformed extension does not throw — it silently yields Arabic-Indic.
    expect(new Intl.NumberFormat("ar-EG-u-nu-bogus").format(5)).toBe("٥");
    expect(new Intl.NumberFormat(buildFormatLocale("ar")).format(5)).toBe("5");
  });

  it("keeps Arabic typography while pinning Western digits", () => {
    const tag = buildFormatLocale("ar", DEFAULT_DISPLAY_PREFS);
    const money = new Intl.NumberFormat(tag, { style: "currency", currency: "EGP" }).format(1234.5);
    expect(money).not.toMatch(/[٠-٩]/);
    expect(money).toContain("ج.م.");
    // Month names stay Arabic — this is why we don't fall back to "en-US".
    expect(formatDate("2026-08-15T00:00:00Z", tag, "long")).toMatch(/[؀-ۿ]/);
  });

  it("defaults to Western + Gregorian when no prefs are given", () => {
    expect(buildFormatLocale("ar")).toBe(buildFormatLocale("ar", DEFAULT_DISPLAY_PREFS));
    expect(buildFormatLocale("en")).toBe("en-EG");
  });
});

describe("langOf", () => {
  it("recovers the language from any tag we build", () => {
    for (const prefs of ALL_PREFS) {
      expect(langOf(buildFormatLocale("ar", prefs))).toBe("ar");
      expect(langOf(buildFormatLocale("en", prefs))).toBe("en");
    }
  });
});

describe("display-pref cookie", () => {
  const TENANT = "e0f39d77-65de-49a3-9a4b-282b47baa54d";
  const OTHER = "11111111-2222-3333-4444-555555555555";

  it("round-trips every combination", () => {
    for (const prefs of ALL_PREFS) {
      expect(decodeDisplayPrefs(encodeDisplayPrefs(prefs, TENANT), TENANT)).toEqual(prefs);
    }
  });

  it("ignores a cookie stamped for a different tenant", () => {
    const raw = encodeDisplayPrefs({ numerals: "arab", calendar: "islamic" }, TENANT);
    expect(decodeDisplayPrefs(raw, OTHER)).toEqual(DEFAULT_DISPLAY_PREFS);
    // …but accepts it when the tenant isn't known yet (server-side first paint).
    expect(decodeDisplayPrefs(raw)).toEqual({ numerals: "arab", calendar: "islamic" });
  });

  it("falls back to defaults on absent or malformed values", () => {
    for (const raw of [undefined, null, "", "garbage", "v2.x.arab.islamic", "v1.only.three"]) {
      expect(decodeDisplayPrefs(raw)).toEqual(DEFAULT_DISPLAY_PREFS);
    }
  });
});

describe("formatDuration", () => {
  // The POS shift chip hardcoded `${h}h ${m}m`, whose h>0 branch had no Arabic
  // path — Arabic cashiers saw a literal "12h 47m" all shift.
  it("localises the units instead of hardcoding h/m", () => {
    const ar = formatDuration(767, buildFormatLocale("ar"));
    expect(ar).not.toContain("h");
    expect(ar).toMatch(/[؀-ۿ]/);
    expect(formatDuration(767, buildFormatLocale("en"))).toMatch(/12/);
  });

  it("drops the hour part below an hour", () => {
    expect(formatDuration(47, buildFormatLocale("en"))).not.toMatch(/\d+\s*h/);
  });
});
