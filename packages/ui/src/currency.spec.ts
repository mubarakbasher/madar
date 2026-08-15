import { describe, expect, it } from "vitest";
import {
  currencyMinorUnits,
  currencySymbol,
  formatMoney,
  formatNumber,
  majorToMinor,
  minorToMajor,
} from "./currency";

// The canonical money helper had no tests at all, while every screen in both
// apps renders through it. These cover the two things that actually broke in
// production: currencies whose minor units aren't 2, and symbol rendering.

describe("currencyMinorUnits", () => {
  it("knows the currencies that are not 2-decimal", () => {
    expect(currencyMinorUnits("EGP")).toBe(2);
    expect(currencyMinorUnits("USD")).toBe(2);
    expect(currencyMinorUnits("KWD")).toBe(3);
    expect(currencyMinorUnits("JPY")).toBe(0);
  });

  it("falls back to 2 for unknown codes", () => {
    expect(currencyMinorUnits("ZZZ")).toBe(2);
  });
});

describe("minorToMajor / majorToMinor", () => {
  it("round-trips at each precision", () => {
    expect(minorToMajor(14900, "EGP")).toBe(149);
    expect(minorToMajor(14900, "KWD")).toBe(14.9);
    expect(minorToMajor(14900, "JPY")).toBe(14900);

    expect(majorToMinor(149, "EGP")).toBe(14900);
    expect(majorToMinor(14.9, "KWD")).toBe(14900);
    expect(majorToMinor(14900, "JPY")).toBe(14900);
  });

  it("accepts bigint and string cent amounts", () => {
    expect(minorToMajor(16000n, "EGP")).toBe(160);
    expect(minorToMajor("16000", "EGP")).toBe(160);
  });
});

describe("formatMoney", () => {
  it("renders EGP with its own symbol, never sterling or dollars", () => {
    const en = formatMoney(16000, "EGP", "en");
    expect(en).toContain("160");
    expect(en).not.toContain("£");
    expect(en).not.toContain("$");
  });

  it("uses the currency's real precision", () => {
    expect(formatMoney(14900, "KWD", "en")).toContain("14.9");
    // JPY has no minor unit — 14900 cents is ¥14,900, not ¥149.
    expect(formatMoney(14900, "JPY", "en")).toContain("14,900");
  });

  // Western digits are the product default in every locale
  // (docs/i18n-guide.md §5.1). This asserted the opposite until 2026-08-15,
  // which is how the mixed-numeral bug survived: money rendered `٢٢` while
  // next-intl rendered `22` two elements away.
  it("keeps Arabic on Western digits by default", () => {
    const ar = formatMoney(16000, "EGP", "ar");
    expect(ar).not.toMatch(/[٠-٩]/);
    expect(ar).toContain("160");
    // …but still Arabic typography, not an English fallback.
    expect(ar).toContain("ج.م.");
  });

  it("renders Arabic-Indic digits when a tenant opts in via the tag", () => {
    expect(formatMoney(16000, "EGP", "ar-EG-u-nu-arab")).toMatch(/[٠-٩]/);
  });

  it("honours fraction-digit overrides for compact displays", () => {
    expect(formatMoney(14900, "EGP", "en", { min: 0, max: 0 })).not.toContain(".");
  });
});

// The bug this guards against is not "wrong digits" — it is *two* numbering
// systems on one screen. next-intl formats ICU plurals through the bare tag
// (`ar`), and these helpers format everything else. If the two ever disagree
// again, a user sees `٢٢ منتج` beside `عرض 22 من 22`.
describe("agreement with next-intl's numbering system", () => {
  for (const locale of ["en", "ar"] as const) {
    it(`matches Intl.NumberFormat("${locale}") — the tag next-intl uses`, () => {
      const nextIntl = new Intl.NumberFormat(locale).format(1234);
      const ours = formatNumber(1234, locale);
      const digitsOf = (s: string) => s.replace(/[^\p{Nd}]/gu, "");
      // Separators legitimately differ by region; the digits must not.
      expect(digitsOf(ours)).toBe(digitsOf(nextIntl));
    });
  }
});

describe("currencySymbol", () => {
  it("never returns a hardcoded sterling sign for EGP", () => {
    expect(currencySymbol("EGP", "en")).not.toBe("£");
    expect(currencySymbol("EGP", "ar")).not.toBe("£");
  });

  it("returns a distinct symbol per currency", () => {
    expect(currencySymbol("USD", "en")).toBe("$");
    expect(currencySymbol("GBP", "en")).toBe("£");
  });

  it("falls back to the ISO code for unknown currencies", () => {
    expect(currencySymbol("ZZZ", "en")).toBe("ZZZ");
  });
});
