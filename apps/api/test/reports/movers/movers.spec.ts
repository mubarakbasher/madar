import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../../helpers/app";
import { TokenService } from "../../../src/tenant/auth/token.service";
import { makeTenant, makeTenantWithCatalog } from "../../helpers/fixtures";

/**
 * Seed a paid sale-line for a chosen product at a chosen day. Used to drive
 * movers ranking across the test window.
 */
async function seedSale(opts: {
  tenantId: string;
  branchId: string;
  cashierId: string | null;
  productId: string;
  qty: number;
  unitPriceCents: bigint;
  cogsCents: bigint;
  occurredAt: Date;
  currencyCode?: string;
  paymentStatus?: "paid" | "payment_pending" | "disputed" | "refunded";
}) {
  const total = opts.unitPriceCents * BigInt(opts.qty);
  const sale = await adminPrisma.sale.create({
    data: {
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      code: `TX-${randomUUID().slice(0, 6).toUpperCase()}`,
      cashier_id: opts.cashierId ?? opts.tenantId,
      subtotal_cents: total,
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
      line_total_cents: total,
      cogs_snapshot_cents: opts.cogsCents,
    },
  });
  return sale;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("GET /v1/reports/movers — top-N movers + slow movers", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  const today = new Date();
  const from = isoDate(new Date(today.getTime() - 13 * 86_400_000));
  const to = isoDate(today);

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  // ─── role gate ──────────────────────────────────────────────────────

  it("returns 403 for a cashier", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "mov-cashier" });
    const cashier = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "cashier",
    });
    const res = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to })
      .set("Authorization", `Bearer ${cashier.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  // ─── metric=revenue happy path ──────────────────────────────────────

  it("metric=revenue: ranks products by revenue DESC", async () => {
    const t = await makeTenantWithCatalog({
      slugPrefix: "mov-rev",
      products: [
        { sku: "A-LOW",  price_cents: 1_000n, cost_cents: 200n,  starting_qty: 50 },
        { sku: "B-MID",  price_cents: 5_000n, cost_cents: 1_500n, starting_qty: 50 },
        { sku: "C-HIGH", price_cents: 9_000n, cost_cents: 4_000n, starting_qty: 50 },
      ],
    });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const [pLow, pMid, pHigh] = t.products;
    const day = new Date(today.getTime() - 2 * 86_400_000);

    // Revenue ranking: C (9000 * 3 = 27000) > B (5000 * 4 = 20000) > A (1000 * 10 = 10000).
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: pHigh!.id, qty: 3, unitPriceCents: pHigh!.price_cents, cogsCents: pHigh!.cost_cents, occurredAt: day });
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: pMid!.id,  qty: 4, unitPriceCents: pMid!.price_cents,  cogsCents: pMid!.cost_cents,  occurredAt: day });
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: pLow!.id,  qty: 10, unitPriceCents: pLow!.price_cents, cogsCents: pLow!.cost_cents,  occurredAt: day });

    const res = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to, metric: "revenue" })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.metric).toBe("revenue");
    expect(res.body.items.map((i: { sku: string }) => i.sku)).toEqual(["C-HIGH", "B-MID", "A-LOW"]);
    expect(res.body.items[0].revenue_cents).toBe("27000");
    expect(res.body.items[0].units).toBe(3);
    expect(res.body.items[0].sparkline_7d).toHaveLength(7);
    // gross_profit_pct present and > 0 for a profitable product
    expect(res.body.items[0].gross_profit_pct).toBeGreaterThan(0);
  });

  // ─── metric=units reorders ──────────────────────────────────────────

  it("metric=units: cheap-but-high-volume product moves to the top", async () => {
    const t = await makeTenantWithCatalog({
      slugPrefix: "mov-units",
      products: [
        { sku: "A-LOW",  price_cents: 1_000n, cost_cents: 200n,  starting_qty: 50 },
        { sku: "B-MID",  price_cents: 5_000n, cost_cents: 1_500n, starting_qty: 50 },
        { sku: "C-HIGH", price_cents: 9_000n, cost_cents: 4_000n, starting_qty: 50 },
      ],
    });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const [pLow, pMid, pHigh] = t.products;
    const day = new Date(today.getTime() - 2 * 86_400_000);

    // Units: A=10, B=4, C=3. So units order: A > B > C (revenue order: C > B > A).
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: pHigh!.id, qty: 3, unitPriceCents: pHigh!.price_cents, cogsCents: pHigh!.cost_cents, occurredAt: day });
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: pMid!.id,  qty: 4, unitPriceCents: pMid!.price_cents,  cogsCents: pMid!.cost_cents,  occurredAt: day });
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: pLow!.id,  qty: 10, unitPriceCents: pLow!.price_cents, cogsCents: pLow!.cost_cents,  occurredAt: day });

    const res = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to, metric: "units" })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.metric).toBe("units");
    expect(res.body.items.map((i: { sku: string }) => i.sku)).toEqual(["A-LOW", "B-MID", "C-HIGH"]);
    expect(res.body.items[0].units).toBe(10);
  });

  // ─── metric=profit: includes cogs in ranking ────────────────────────

  it("metric=profit: high-margin product can outrank a higher-revenue/low-margin one", async () => {
    const t = await makeTenantWithCatalog({
      slugPrefix: "mov-profit",
      products: [
        // P1: revenue 10000, profit 9000  (cost 100, price 1000, qty 10) → margin 90%
        { sku: "MARGIN-90", price_cents: 1_000n, cost_cents: 100n, starting_qty: 50 },
        // P2: revenue 20000, profit 2000 (cost 900, price 1000, qty 20) → margin 10%
        { sku: "MARGIN-10", price_cents: 1_000n, cost_cents: 900n, starting_qty: 50 },
      ],
    });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const [p1, p2] = t.products;
    const day = new Date(today.getTime() - 2 * 86_400_000);

    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: p1!.id, qty: 10, unitPriceCents: p1!.price_cents, cogsCents: p1!.cost_cents, occurredAt: day });
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: p2!.id, qty: 20, unitPriceCents: p2!.price_cents, cogsCents: p2!.cost_cents, occurredAt: day });

    const resRev = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to, metric: "revenue" })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(resRev.status).toBe(200);
    expect(resRev.body.items.map((i: { sku: string }) => i.sku)).toEqual(["MARGIN-10", "MARGIN-90"]);

    const resProfit = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to, metric: "profit" })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(resProfit.status).toBe(200);
    // Ranking flips: MARGIN-90 has the higher gross profit despite lower revenue.
    expect(resProfit.body.items.map((i: { sku: string }) => i.sku)).toEqual(["MARGIN-90", "MARGIN-10"]);
    expect(resProfit.body.items[0].gross_profit_cents).toBe("9000");
    expect(resProfit.body.items[0].gross_profit_pct).toBe(90);
  });

  // ─── slow movers: in-stock, low-sold products surface ───────────────

  it("slow movers: products with stock > 0 and units < 5 in the window appear", async () => {
    const t = await makeTenantWithCatalog({
      slugPrefix: "mov-slow",
      products: [
        // Best-seller — should NOT appear in slow_movers.
        { sku: "HOT", price_cents: 2_000n, cost_cents: 500n, starting_qty: 20 },
        // Slow — in stock, sells nothing → should appear.
        { sku: "DUSTY", price_cents: 5_000n, cost_cents: 2_000n, starting_qty: 30 },
      ],
    });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const [hot] = t.products;
    const day = new Date(today.getTime() - 2 * 86_400_000);
    // 10 units of HOT → above the slow threshold.
    await seedSale({ tenantId: t.tenantId, branchId: t.branchId, cashierId: t.userId,
                    productId: hot!.id, qty: 10, unitPriceCents: hot!.price_cents, cogsCents: hot!.cost_cents, occurredAt: day });

    const res = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to })
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    const slowSkus = res.body.slow_movers.map((i: { sku: string }) => i.sku);
    expect(slowSkus).toContain("DUSTY");
    expect(slowSkus).not.toContain("HOT");
    const dusty = res.body.slow_movers.find((i: { sku: string }) => i.sku === "DUSTY");
    expect(dusty.units).toBe(0);
    expect(dusty.revenue_cents).toBe("0");
  });

  // ─── RLS canary ─────────────────────────────────────────────────────

  it("RLS canary: tenant B's movers do not surface tenant A's sales", async () => {
    const tA = await makeTenantWithCatalog({ slugPrefix: "mov-rls-a" });
    const tB = await makeTenant({ slugPrefix: "mov-rls-b" });
    const tokenA = (
      await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })
    ).access_token;
    const tokenB = (
      await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })
    ).access_token;

    const day = new Date(today.getTime() - 1 * 86_400_000);
    await seedSale({
      tenantId: tA.tenantId,
      branchId: tA.branchId,
      cashierId: tA.userId,
      productId: tA.products[0]!.id,
      qty: 5,
      unitPriceCents: 9_900n,
      cogsCents: 1_000n,
      occurredAt: day,
    });

    const resA = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to })
      .set("Authorization", `Bearer ${tokenA}`);
    const resB = await request(booted.http)
      .get("/v1/reports/movers")
      .query({ currency: "USD", from, to })
      .set("Authorization", `Bearer ${tokenB}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.items.length).toBeGreaterThan(0);
    expect(resB.body.items).toEqual([]);
    expect(resB.body.slow_movers).toEqual([]);
  });
});
