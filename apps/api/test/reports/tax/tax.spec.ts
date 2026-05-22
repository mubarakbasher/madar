import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../../helpers/app";
import { TokenService } from "../../../src/tenant/auth/token.service";
import { makeTenantWithCatalog } from "../../helpers/fixtures";

/**
 * Direct seed of a sale + its lines with explicit `tax_cents` per line so the
 * tax aggregate query has stable input. Mirrors the dashboard.spec helper.
 */
async function seedTaxedSale(opts: {
  tenantId: string;
  branchId: string;
  cashierId: string;
  occurredAt?: Date;
  paymentStatus?: "paid" | "payment_pending" | "disputed" | "refunded";
  currencyCode?: string;
  lines: Array<{
    productId: string;
    qty: number;
    unitPriceCents: bigint;
    lineTotalCents: bigint;
    taxCents: bigint;
    cogsCents?: bigint;
  }>;
}): Promise<string> {
  const subtotal = opts.lines.reduce((sum, l) => sum + l.lineTotalCents, 0n);
  const taxTotal = opts.lines.reduce((sum, l) => sum + l.taxCents, 0n);
  const total = subtotal + taxTotal;
  const sale = await adminPrisma.sale.create({
    data: {
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      code: `TX-${randomUUID().slice(0, 6).toUpperCase()}`,
      cashier_id: opts.cashierId,
      subtotal_cents: subtotal,
      tax_cents: taxTotal,
      total_cents: total,
      currency_code: opts.currencyCode ?? "USD",
      payment_method: "cash",
      payment_status: opts.paymentStatus ?? "paid",
      client_uuid: randomUUID(),
      occurred_at: opts.occurredAt ?? new Date(),
    },
  });
  for (const l of opts.lines) {
    await adminPrisma.saleLine.create({
      data: {
        tenant_id: opts.tenantId,
        sale_id: sale.id,
        product_id: l.productId,
        qty: l.qty,
        unit_price_cents: l.unitPriceCents,
        line_total_cents: l.lineTotalCents,
        tax_cents: l.taxCents,
        cogs_snapshot_cents: l.cogsCents ?? 0n,
      },
    });
  }
  return sale.id;
}

describe("GET /v1/reports/tax — tax report", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  // Period covering "today" for all seeded sales.
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const query = `?currency=USD&from=${today}&to=${tomorrow}`;

  // 1. RBAC: cashier 403
  it("403 for cashier role", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "tax-cashier" });
    const cashier = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "cashier",
    });
    const res = await request(booted.http)
      .get(`/v1/reports/tax${query}`)
      .set("Authorization", `Bearer ${cashier.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  // 2. Happy: two tax classes + a fall-through to default; assert per-group sums.
  it("groups by tax class and reports correct sums", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "tax-happy" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });

    // Two tax classes: STD 15%, RED 5%.
    const std = await adminPrisma.taxClass.create({
      data: {
        tenant_id: t.tenantId,
        code: "STD",
        name_i18n: { en: "Standard", ar: "قياسي" },
        rate_bps: 1500,
      },
    });
    const red = await adminPrisma.taxClass.create({
      data: {
        tenant_id: t.tenantId,
        code: "RED",
        name_i18n: { en: "Reduced", ar: "مخفض" },
        rate_bps: 500,
      },
    });

    // Default tax class on tenant — covers products without a class. We
    // intentionally reuse STD as the default so the fall-through product still
    // groups into STD (15%).
    await adminPrisma.tenant.update({
      where: { id: t.tenantId },
      data: {
        default_tax_class_id: std.id,
        tax_registration_number: "TRN-TEST-001",
      },
    });

    // Assign STD to product[0], RED to product[1], leave product[2] uncoded
    // → falls through to tenant default (STD).
    await adminPrisma.product.update({
      where: { id: t.products[0]!.id },
      data: { tax_class_id: std.id },
    });
    await adminPrisma.product.update({
      where: { id: t.products[1]!.id },
      data: { tax_class_id: red.id },
    });

    // Sale 1 — STD product line @ 10_000 + tax 1500 ; RED product line @ 4_000 + tax 200
    await seedTaxedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      lines: [
        {
          productId: t.products[0]!.id,
          qty: 1,
          unitPriceCents: 10_000n,
          lineTotalCents: 10_000n,
          taxCents: 1_500n,
        },
        {
          productId: t.products[1]!.id,
          qty: 1,
          unitPriceCents: 4_000n,
          lineTotalCents: 4_000n,
          taxCents: 200n,
        },
      ],
    });

    // Sale 2 — product[2] (no tax class) → falls into STD via default; @ 2_000 + tax 300
    await seedTaxedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      lines: [
        {
          productId: t.products[2]!.id,
          qty: 1,
          unitPriceCents: 2_000n,
          lineTotalCents: 2_000n,
          taxCents: 300n,
        },
      ],
    });

    const res = await request(booted.http)
      .get(`/v1/reports/tax${query}`)
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.tax_registration_number).toBe("TRN-TEST-001");
    expect(res.body.currency).toBe("USD");

    const items: Array<{
      tax_class_code: string | null;
      rate_bps: number;
      taxable_sales_cents: string;
      tax_collected_cents: string;
      transactions: number;
    }> = res.body.items;

    const stdItem = items.find((i) => i.tax_class_code === "STD");
    const redItem = items.find((i) => i.tax_class_code === "RED");
    expect(stdItem).toBeDefined();
    expect(redItem).toBeDefined();
    // STD = product[0] line (10_000) + product[2] line (2_000) = 12_000; tax = 1500+300 = 1800
    expect(stdItem!.taxable_sales_cents).toBe("12000");
    expect(stdItem!.tax_collected_cents).toBe("1800");
    expect(stdItem!.rate_bps).toBe(1500);
    // RED = product[1] = 4_000; tax = 200
    expect(redItem!.taxable_sales_cents).toBe("4000");
    expect(redItem!.tax_collected_cents).toBe("200");
    expect(redItem!.rate_bps).toBe(500);
  });

  // 3. Totals = sum of items
  it("totals equal sum of items", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "tax-totals" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const tc = await adminPrisma.taxClass.create({
      data: {
        tenant_id: t.tenantId,
        code: "VAT",
        name_i18n: { en: "VAT", ar: "ضريبة" },
        rate_bps: 1000,
      },
    });
    await adminPrisma.product.update({
      where: { id: t.products[0]!.id },
      data: { tax_class_id: tc.id },
    });
    await seedTaxedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      lines: [
        {
          productId: t.products[0]!.id,
          qty: 1,
          unitPriceCents: 5_000n,
          lineTotalCents: 5_000n,
          taxCents: 500n,
        },
      ],
    });

    const res = await request(booted.http)
      .get(`/v1/reports/tax${query}`)
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    const sumTaxable = res.body.items.reduce(
      (a: bigint, i: { taxable_sales_cents: string }) => a + BigInt(i.taxable_sales_cents),
      0n,
    );
    const sumTax = res.body.items.reduce(
      (a: bigint, i: { tax_collected_cents: string }) => a + BigInt(i.tax_collected_cents),
      0n,
    );
    expect(res.body.totals.taxable_sales_cents).toBe(sumTaxable.toString());
    expect(res.body.totals.tax_collected_cents).toBe(sumTax.toString());
  });

  // 4. Refunded excluded
  it("refunded sales are excluded", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "tax-refunded" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const tc = await adminPrisma.taxClass.create({
      data: {
        tenant_id: t.tenantId,
        code: "STD",
        name_i18n: { en: "Standard", ar: "قياسي" },
        rate_bps: 1500,
      },
    });
    await adminPrisma.product.update({
      where: { id: t.products[0]!.id },
      data: { tax_class_id: tc.id },
    });
    // One refunded sale — must NOT contribute.
    await seedTaxedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      paymentStatus: "refunded",
      lines: [
        {
          productId: t.products[0]!.id,
          qty: 1,
          unitPriceCents: 8_000n,
          lineTotalCents: 8_000n,
          taxCents: 1_200n,
        },
      ],
    });
    // One paid sale — should be the only contributor.
    await seedTaxedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      lines: [
        {
          productId: t.products[0]!.id,
          qty: 1,
          unitPriceCents: 1_000n,
          lineTotalCents: 1_000n,
          taxCents: 150n,
        },
      ],
    });

    const res = await request(booted.http)
      .get(`/v1/reports/tax${query}`)
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.taxable_sales_cents).toBe("1000");
    expect(res.body.totals.tax_collected_cents).toBe("150");
  });

  // 5. PDF format
  it("format=pdf returns application/pdf with non-empty body", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "tax-pdf" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const res = await request(booted.http)
      .get(`/v1/reports/tax${query}&format=pdf`)
      .set("Authorization", `Bearer ${owner.access_token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    expect(body.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  // 6. RLS canary
  it("RLS canary: tenant B does not see tenant A's tax data", async () => {
    const tA = await makeTenantWithCatalog({ slugPrefix: "tax-rls-a" });
    const tB = await makeTenantWithCatalog({ slugPrefix: "tax-rls-b" });
    const tokenA = (
      await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })
    ).access_token;
    const tokenB = (
      await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })
    ).access_token;

    const tc = await adminPrisma.taxClass.create({
      data: {
        tenant_id: tA.tenantId,
        code: "STD",
        name_i18n: { en: "Standard", ar: "قياسي" },
        rate_bps: 1500,
      },
    });
    await adminPrisma.product.update({
      where: { id: tA.products[0]!.id },
      data: { tax_class_id: tc.id },
    });
    await seedTaxedSale({
      tenantId: tA.tenantId,
      branchId: tA.branchId,
      cashierId: tA.userId,
      lines: [
        {
          productId: tA.products[0]!.id,
          qty: 1,
          unitPriceCents: 50_000n,
          lineTotalCents: 50_000n,
          taxCents: 7_500n,
        },
      ],
    });

    const [resA, resB] = await Promise.all([
      request(booted.http)
        .get(`/v1/reports/tax${query}`)
        .set("Authorization", `Bearer ${tokenA}`),
      request(booted.http)
        .get(`/v1/reports/tax${query}`)
        .set("Authorization", `Bearer ${tokenB}`),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(Number(resA.body.totals.taxable_sales_cents)).toBeGreaterThanOrEqual(50_000);
    expect(resB.body.totals.taxable_sales_cents).toBe("0");
    expect(resB.body.totals.tax_collected_cents).toBe("0");
    expect(resB.body.items).toEqual([]);
  });
});
