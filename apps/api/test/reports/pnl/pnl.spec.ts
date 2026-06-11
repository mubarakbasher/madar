import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../../helpers/app";
import { TokenService } from "../../../src/tenant/auth/token.service";
import { makeTenant, makeTenantWithCatalog } from "../../helpers/fixtures";

/**
 * Seed a paid sale + one matching line so the P&L queries pick up sale-
 * level totals (revenue/discount/tax) AND line-level COGS. cogsCents in
 * this helper is the per-LINE total (not per-unit) — matches what
 * sales.service.ts writes for cogs_snapshot_cents.
 */
async function seedSale(opts: {
  tenantId: string;
  branchId: string;
  cashierId: string;
  productId: string;
  qty: number;
  unitPriceCents: bigint;
  cogsCents: bigint;
  occurredAt: Date;
  paymentStatus?: "paid" | "payment_pending" | "disputed" | "refunded";
  currencyCode?: string;
  discountCents?: bigint;
  taxCents?: bigint;
}) {
  const lineTotal = opts.unitPriceCents * BigInt(opts.qty);
  const discount = opts.discountCents ?? 0n;
  const tax = opts.taxCents ?? 0n;
  const total = lineTotal - discount + tax;
  const sale = await adminPrisma.sale.create({
    data: {
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      code: `TX-${randomUUID().slice(0, 6).toUpperCase()}`,
      cashier_id: opts.cashierId,
      subtotal_cents: lineTotal,
      discount_cents: discount,
      tax_cents: tax,
      total_cents: total,
      currency_code: opts.currencyCode ?? "USD",
      payment_method: "cash",
      payment_status: opts.paymentStatus ?? "paid",
      client_uuid: randomUUID(),
      occurred_at: opts.occurredAt,
    },
  });
  await adminPrisma.saleLine.create({
    data: {
      tenant_id: opts.tenantId,
      sale_id: sale.id,
      product_id: opts.productId,
      qty: opts.qty,
      unit_price_cents: opts.unitPriceCents,
      line_total_cents: lineTotal,
      cogs_snapshot_cents: opts.cogsCents,
    },
  });
  return sale;
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("GET /v1/reports/pnl", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("403 for cashier", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "pnl-403" });
    const cashier = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "cashier",
    });
    const res = await request(booted.http)
      .get("/v1/reports/pnl")
      .query({ currency: "USD", from: todayIso(-7), to: todayIso() })
      .set("Authorization", `Bearer ${cashier.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("happy: two cash sales of qty=2 product[0] (price=3500, cost=1200)", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "pnl-happy" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!; // 3500 / 1200
    for (let i = 0; i < 2; i++) {
      await seedSale({
        tenantId: t.tenantId,
        branchId: t.branchId,
        cashierId: t.userId,
        productId: p.id,
        qty: 2,
        unitPriceCents: p.price_cents,
        cogsCents: p.cost_cents * 2n,
        occurredAt: new Date(),
      });
    }

    const res = await request(booted.http)
      .get("/v1/reports/pnl")
      .query({ currency: "USD", from: todayIso(-1), to: todayIso() })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue_cents).toBe("14000"); // 2 × 2 × 3500
    expect(res.body.discount_cents).toBe("0");
    expect(res.body.tax_cents).toBe("0");
    expect(res.body.cogs_cents).toBe("4800"); // 2 × (2 × 1200)
    expect(res.body.gross_profit_cents).toBe("9200");
    expect(res.body.gross_profit_pct).toBeCloseTo(65.71, 1);
    expect(res.body.refunds_cents).toBe("0");
    // Net revenue = revenue − refunds (NOT gross profit − refunds).
    expect(res.body.net_revenue_cents).toBe("14000");
    expect(res.body.transactions).toBe(2);
    expect(res.body.mixed_currency_warning).toBe(false);
    expect(Array.isArray(res.body.breakdown)).toBe(true);
  });

  it("refunds: revenue stays GROSS, refunds_cents sums refunded_amount_cents (full + partial), net = revenue − refunds", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "pnl-refund" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!;
    const paid = await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 2,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents * 2n,
      occurredAt: new Date(),
    });
    // Partially refunded sale: status stays 'paid' but 1500 went back.
    await adminPrisma.sale.update({
      where: { id: paid.id },
      data: { refunded_amount_cents: 1500n },
    });
    const refunded = await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 2,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents * 2n,
      occurredAt: new Date(),
    });
    await adminPrisma.sale.update({
      where: { id: refunded.id },
      data: { payment_status: "refunded", refunded_amount_cents: 7000n },
    });

    const res = await request(booted.http)
      .get("/v1/reports/pnl")
      .query({ currency: "USD", from: todayIso(-1), to: todayIso() })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    // Both sales collected money — both are revenue; the money returned shows
    // once, in refunds. The old model both excluded refunded sales from
    // revenue AND subtracted them again (M-13) and missed partial refunds.
    expect(res.body.revenue_cents).toBe("14000");
    expect(res.body.refunds_cents).toBe("8500"); // 7000 full + 1500 partial
    expect(res.body.net_revenue_cents).toBe("5500");
    expect(res.body.transactions).toBe(2);
  });

  it("H-4 regression: discounts are not subtracted twice from gross profit", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "pnl-disc" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!; // 3500 / 1200
    // qty 2 @3500 with a 500 discount → customer paid 6500; COGS 2400.
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 2,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents * 2n,
      discountCents: 500n,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/reports/pnl")
      .query({ currency: "USD", from: todayIso(-1), to: todayIso() })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue_cents).toBe("6500"); // already net of discount
    expect(res.body.discount_cents).toBe("500"); // informational line
    // gross profit = 6500 − 0 tax − 2400 cogs = 4100. The pre-fix formula
    // produced 3600 (discount subtracted from an already-discounted total).
    expect(res.body.gross_profit_cents).toBe("4100");
    expect(res.body.net_revenue_cents).toBe("6500");
  });

  it("branch filter narrows to a single branch", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "pnl-branch" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    // Second branch + a sale on it.
    const branch2 = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `BR-${randomUUID().slice(0, 4)}`,
        name_i18n: { en: "Second", ar: "الثاني" },
        currency_code: "USD",
      },
    });
    const p = t.products[0]!;
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 2,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents * 2n,
      occurredAt: new Date(),
    });
    await seedSale({
      tenantId: t.tenantId,
      branchId: branch2.id,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/reports/pnl")
      .query({
        currency: "USD",
        from: todayIso(-1),
        to: todayIso(),
        branch_id: branch2.id,
      })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue_cents).toBe("3500");
    expect(res.body.cogs_cents).toBe("1200");
    expect(res.body.transactions).toBe(1);
  });

  it("RLS canary: tenant B sees nothing", async () => {
    const tA = await makeTenantWithCatalog({ slugPrefix: "pnl-rls-a" });
    const tB = await makeTenant({ slugPrefix: "pnl-rls-b" });
    const tokenB = (
      await tokens.mintPair({
        userId: tB.userId,
        tenantId: tB.tenantId,
        role: "owner",
      })
    ).access_token;

    const p = tA.products[0]!;
    await seedSale({
      tenantId: tA.tenantId,
      branchId: tA.branchId,
      cashierId: tA.userId,
      productId: p.id,
      qty: 5,
      unitPriceCents: 99_000n,
      cogsCents: 50_000n * 5n,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/reports/pnl")
      .query({ currency: "USD", from: todayIso(-1), to: todayIso() })
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue_cents).toBe("0");
    expect(res.body.cogs_cents).toBe("0");
    expect(res.body.transactions).toBe(0);
    // group_by=period emits one row per day in the range; every row is zero.
    for (const row of res.body.breakdown as Array<{ revenue_cents: string; cogs_cents: string; transactions: number }>) {
      expect(row.revenue_cents).toBe("0");
      expect(row.cogs_cents).toBe("0");
      expect(row.transactions).toBe(0);
    }
  });

  it("group_by=branch returns one row per branch with correct totals", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "pnl-grp-br" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const branch2 = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `BR-${randomUUID().slice(0, 4)}`,
        name_i18n: { en: "Second", ar: "الثاني" },
        currency_code: "USD",
      },
    });
    const p = t.products[0]!;
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 2,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents * 2n,
      occurredAt: new Date(),
    });
    await seedSale({
      tenantId: t.tenantId,
      branchId: branch2.id,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/reports/pnl")
      .query({
        currency: "USD",
        from: todayIso(-1),
        to: todayIso(),
        group_by: "branch",
      })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.breakdown).toHaveLength(2);
    const byKey = new Map<string, { revenue_cents: string; cogs_cents: string; transactions: number }>(
      res.body.breakdown.map((r: { key: string; revenue_cents: string; cogs_cents: string; transactions: number }) => [
        r.key,
        r,
      ]),
    );
    expect(byKey.get(t.branchId)?.revenue_cents).toBe("7000");
    expect(byKey.get(t.branchId)?.cogs_cents).toBe("2400");
    expect(byKey.get(t.branchId)?.transactions).toBe(1);
    expect(byKey.get(branch2.id)?.revenue_cents).toBe("3500");
    expect(byKey.get(branch2.id)?.cogs_cents).toBe("1200");
    expect(byKey.get(branch2.id)?.transactions).toBe(1);
  });
});
