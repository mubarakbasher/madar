import { describe, expect, it } from "vitest";
import {
  formatMoney,
  renderPurchaseOrderPdf,
  type PurchaseOrderPdfInput,
} from "../../src/shared/pdf/po-pdf.renderer";

function buildInput(overrides: Partial<PurchaseOrderPdfInput> = {}): PurchaseOrderPdfInput {
  return {
    tenant: {
      name: "Acme Trading Co.",
      address_lines: ["12 Market St.", "Cairo 11511"],
      email: "hello@acme.test",
      phone: "+20 2 1234 5678",
    },
    po: {
      code: "PO-000123",
      created_at: new Date("2026-05-19T10:00:00Z"),
      expected_at: new Date("2026-06-01T00:00:00Z"),
      currency_code: "EGP",
      subtotal_cents: 125000,
      tax_cents: 17500,
      shipping_cents: 5000,
      total_cents: 147500,
      notes: "Please call before delivery.",
    },
    supplier: {
      name: "Nile Wholesalers Ltd.",
      contact_name: "Mona Hassan",
      contact_email: "mona@nilewholesale.test",
      address_lines: ["10th of Ramadan Industrial Zone", "Sharqia Governorate"],
    },
    branch: {
      name: "Heliopolis Branch",
      address_lines: ["Korba St.", "Heliopolis, Cairo"],
    },
    lines: [
      {
        sku: "SKU-001",
        product_name: "Widget A",
        qty_ordered: 10,
        unit_cost_cents: 5000,
        line_total_cents: 50000,
      },
      {
        sku: "SKU-002",
        product_name: "Widget B (premium)",
        qty_ordered: 15,
        unit_cost_cents: 5000,
        line_total_cents: 75000,
      },
    ],
    ...overrides,
  };
}

const PDF_MAGIC = "%PDF-";

describe("renderPurchaseOrderPdf", () => {
  it("returns a Buffer starting with the PDF magic bytes", async () => {
    const buf = await renderPurchaseOrderPdf(buildInput());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString("ascii")).toBe(PDF_MAGIC);
  });

  it("produces a non-trivial buffer (> 1 KB)", async () => {
    const buf = await renderPurchaseOrderPdf(buildInput());
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders with zero lines", async () => {
    const buf = await renderPurchaseOrderPdf(buildInput({ lines: [] }));
    expect(buf.subarray(0, 5).toString("ascii")).toBe(PDF_MAGIC);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders with a single line", async () => {
    const buf = await renderPurchaseOrderPdf(
      buildInput({
        lines: [
          {
            sku: "SOLO",
            product_name: "Lonely Widget",
            qty_ordered: 1,
            unit_cost_cents: 9999,
            line_total_cents: 9999,
          },
        ],
      }),
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe(PDF_MAGIC);
  });

  it("renders with 50 lines without throwing", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({
      sku: `SKU-${String(i + 1).padStart(3, "0")}`,
      product_name: `Product number ${i + 1}`,
      qty_ordered: (i % 5) + 1,
      unit_cost_cents: 1000 + i * 25,
      line_total_cents: (1000 + i * 25) * ((i % 5) + 1),
    }));
    const buf = await renderPurchaseOrderPdf(buildInput({ lines }));
    expect(buf.subarray(0, 5).toString("ascii")).toBe(PDF_MAGIC);
    expect(buf.length).toBeGreaterThan(1500);
  });

  it("renders with null expected_at and null notes", async () => {
    const buf = await renderPurchaseOrderPdf(
      buildInput({
        po: {
          code: "PO-NULL",
          created_at: new Date("2026-05-19T10:00:00Z"),
          expected_at: null,
          currency_code: "USD",
          subtotal_cents: 1000,
          tax_cents: 0,
          shipping_cents: 0,
          total_cents: 1000,
          notes: null,
        },
      }),
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe(PDF_MAGIC);
  });

  it("survives an Arabic supplier name (coerces non-WinAnsi to '?')", async () => {
    const buf = await renderPurchaseOrderPdf(
      buildInput({
        supplier: {
          name: "شركة النيل للجملة", // pdf-lib would reject this on Helvetica
          contact_email: "noor@nile.test",
        },
      }),
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe(PDF_MAGIC);
  });
});

describe("formatMoney", () => {
  it("formats integer minor units without floats, honoring each currency's precision", () => {
    expect(formatMoney("EGP", 0)).toBe("EGP 0.00");
    expect(formatMoney("EGP", 5)).toBe("EGP 0.05");
    expect(formatMoney("EGP", 1250)).toBe("EGP 12.50");
    expect(formatMoney("USD", 99_99_99)).toBe("USD 9,999.99");
    // KWD has THREE minor units (fils): 100000 fils = 100 dinars.
    expect(formatMoney("KWD", 100_000)).toBe("KWD 100.000");
    expect(formatMoney("KWD", 1_500)).toBe("KWD 1.500");
    // JPY has none.
    expect(formatMoney("JPY", 1000)).toBe("JPY 1,000");
  });

  it("handles negative amounts", () => {
    expect(formatMoney("EGP", -1250)).toBe("EGP -12.50");
  });
});
