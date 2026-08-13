import { describe, expect, it } from "vitest";
import { i18nText } from "../../src/shared/dto/i18n-text";

describe("i18nText", () => {
  const schema = i18nText(120);

  it("mirrors ar from en when only en is provided", () => {
    expect(schema.parse({ en: "Espresso" })).toEqual({ en: "Espresso", ar: "Espresso" });
  });

  it("mirrors en from ar when only ar is provided", () => {
    expect(schema.parse({ ar: "إسبريسو" })).toEqual({ en: "إسبريسو", ar: "إسبريسو" });
  });

  it("treats an empty/whitespace string as missing and mirrors over it", () => {
    expect(schema.parse({ en: "  ", ar: "إسبريسو" })).toEqual({ en: "إسبريسو", ar: "إسبريسو" });
    expect(schema.parse({ en: "Espresso", ar: "" })).toEqual({ en: "Espresso", ar: "Espresso" });
  });

  it("keeps distinct values when both are provided", () => {
    expect(schema.parse({ en: "Espresso", ar: "إسبريسو" })).toEqual({
      en: "Espresso",
      ar: "إسبريسو",
    });
  });

  it("trims both sides", () => {
    expect(schema.parse({ en: " Espresso ", ar: " إسبريسو " })).toEqual({
      en: "Espresso",
      ar: "إسبريسو",
    });
  });

  it("rejects when both languages are missing or empty", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ en: "", ar: "" }).success).toBe(false);
    expect(schema.safeParse({ en: "  ", ar: "  " }).success).toBe(false);
  });

  it("enforces max length per key", () => {
    const long = "x".repeat(121);
    expect(schema.safeParse({ en: long }).success).toBe(false);
    expect(schema.safeParse({ en: "ok", ar: long }).success).toBe(false);
    expect(schema.safeParse({ en: "x".repeat(120) }).success).toBe(true);
  });
});
