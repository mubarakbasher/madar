import { describe, expect, it } from "vitest";
import { renderTemplate } from "../../src/common/email/templates";

describe("Email template rendering", () => {
  it("renders welcome in English with var substitution", () => {
    const rendered = renderTemplate("welcome", "en", {
      tenantName: "Bayt Coffee Co.",
      ownerName: "Sara",
      trialEndsAt: "2026-05-28",
      ctaUrl: "https://example.com/login",
    });
    expect(rendered.subject).toContain("Welcome to Madar");
    expect(rendered.html).toContain("Welcome, Sara");
    expect(rendered.html).toContain("Bayt Coffee Co.");
    expect(rendered.html).toContain("2026-05-28");
    expect(rendered.html).toContain("https://example.com/login");
  });

  it("renders welcome in Arabic with RTL direction", () => {
    const rendered = renderTemplate("welcome", "ar", {
      tenantName: "بيت كوفي",
      ownerName: "سارة",
      trialEndsAt: "2026-05-28",
      ctaUrl: "https://example.com/login",
    });
    expect(rendered.subject).toContain("أهلاً");
    expect(rendered.html).toContain('dir="rtl"');
    expect(rendered.html).toContain("سارة");
    expect(rendered.html).toContain("بيت كوفي");
  });

  it("renders payment_received with the reference code", () => {
    const rendered = renderTemplate("payment_received", "en", {
      tenantName: "Bayt Coffee Co.",
      referenceCode: "INV-2026-06-001",
      amountFormatted: "$149",
      paidAt: "2026-06-15",
    });
    expect(rendered.subject).toContain("INV-2026-06-001");
    expect(rendered.html).toContain("INV-2026-06-001");
    expect(rendered.html).toContain("$149");
  });

  it("renders suspended template with deadline", () => {
    const rendered = renderTemplate("suspended", "en", {
      tenantName: "X",
      suspendedAt: "2026-07-01",
      payInvoiceUrl: "https://pay",
      dataExportEndsAt: "2026-10-01",
    });
    expect(rendered.subject).toContain("suspended");
    expect(rendered.text).toContain("2026-10-01");
  });
});
