import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../../helpers/app";
import { TokenService } from "../../../src/tenant/auth/token.service";
import { makeTenant, makeTenantWithCatalog } from "../../helpers/fixtures";

/**
 * Trend analysis report — GET /v1/reports/trends.
 *
 * Asserts:
 *   1. RBAC: cashier → 403 forbidden_role.
 *   2. Happy path window=30 returns 30 daily points; today's value matches a
 *      sale seeded at occurred_at = now.
 *   3. Rolling-avg correctness: 7 daily sales of $100 → 7-day avg on day 7 = $100.
 *   4. YoY overlay populates value_prev for at least some days.
 *   5. RLS canary: tenant B's call does not surface tenant A's revenue.
 */

async function seedSale(opts: {
  tenantId: string;
  branchId: string;
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
      cashier_id: opts.tenantId, // placeholder uuid; never read by the report
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
      // `cogsCents` is the per-unit cost. Production (sales.service.ts) stores
      // the per-line TOTAL (cost_cents × qty) in cogs_snapshot_cents, so the
      // reports sum the column directly without re-multiplying by qty. Mirror
      // that here, otherwise qty>1 sales under-seed COGS and inflate profit.
      cogs_snapshot_cents: opts.cogsCents * BigInt(opts.qty),
    },
  });
  return sale;
}

describe("GET /v1/reports/trends", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns 403 for a cashier (RBAC)", async () => {
    const t = await makeTenant({ slugPrefix: "trends-cashier" });
    const cashier = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "cashier",
    });
    const res = await request(booted.http)
      .get("/v1/reports/trends?currency=USD")
      .set("Authorization", `Bearer ${cashier.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("happy window=30: series has 30 points and today's value matches a seeded sale", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "trends-happy" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      productId: t.products[0]!.id,
      qty: 1,
      unitPriceCents: 4200n,
      cogsCents: 1000n,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/reports/trends?currency=USD&metric=revenue&window=30")
      .set("Authorization", `Bearer ${owner.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.window).toBe(30);
    expect(res.body.metric).toBe("revenue");
    expect(res.body.compare).toBe("none");
    expect(res.body.series).toHaveLength(30);
    const last = res.body.series[res.body.series.length - 1];
    expect(last.value).toBeGreaterThanOrEqual(4200);
    expect(last.value_prev).toBeNull();
    expect(typeof last.rolling_avg).toBe("number");
  });

  it("7-day rolling avg of $100/day equals $100 (10000 cents) on day 7", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "trends-roll" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    // Seed exactly one $100 sale on each of the last 7 days (incl. today).
    // Anchor the dates in UTC at noon so the cast `occurred_at::date` matches
    // PG's `now()::date - N` regardless of the test machine's local TZ.
    const nowUtcMs = Date.now();
    for (let i = 0; i < 7; i++) {
      const when = new Date(nowUtcMs - i * 86_400_000);
      // Force noon UTC: builds an unambiguous mid-day timestamp that lands on
      // the intended date in any reasonable PG TZ (the API uses the session
      // default, which in CI/dev is UTC).
      const utcNoon = new Date(
        Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), 12, 0, 0),
      );
      await seedSale({
        tenantId: t.tenantId,
        branchId: t.branchId,
        productId: t.products[0]!.id,
        qty: 1,
        unitPriceCents: 10000n,
        cogsCents: 1000n,
        occurredAt: utcNoon,
      });
    }

    const res = await request(booted.http)
      .get("/v1/reports/trends?currency=USD&metric=revenue&window=7")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(7);
    const day7 = res.body.series[6];
    expect(day7.value).toBe(10000);
    expect(day7.rolling_avg).toBe(10000);
  });

  it("compare=yoy populates value_prev for at least some days", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "trends-yoy" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    // Seed a sale 365 days ago (within the YoY overlay window) and today (within
    // the current window). Both contribute to a non-null value_prev / value
    // on their respective indices.
    // Seed at noon UTC ~365 days back (TZ-safe — picks a date inside the YoY
    // overlay window for any reasonable PG session TZ).
    const yearAgoBase = new Date(Date.now() - 365 * 86_400_000);
    const yearAgo = new Date(
      Date.UTC(
        yearAgoBase.getUTCFullYear(),
        yearAgoBase.getUTCMonth(),
        yearAgoBase.getUTCDate(),
        12,
        0,
        0,
      ),
    );
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      productId: t.products[0]!.id,
      qty: 1,
      unitPriceCents: 5000n,
      cogsCents: 1000n,
      occurredAt: yearAgo,
    });
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      productId: t.products[0]!.id,
      qty: 1,
      unitPriceCents: 6000n,
      cogsCents: 1000n,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/reports/trends?currency=USD&metric=revenue&window=30&compare=yoy")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.compare).toBe("yoy");
    expect(res.body.series).toHaveLength(30);
    const nonNullPrev = res.body.series.filter(
      (p: { value_prev: number | null }) => p.value_prev !== null,
    );
    // Every day in the overlay slot has a number (0 when no sales) — that's
    // the contract: non-null when compare != none.
    expect(nonNullPrev).toHaveLength(30);
    // And at least one day registered actual prior-year revenue.
    const withRevenue = res.body.series.filter(
      (p: { value_prev: number | null }) => (p.value_prev ?? 0) > 0,
    );
    expect(withRevenue.length).toBeGreaterThan(0);
    expect(res.body.summary.prev_total).toBeGreaterThan(0);
  });

  it("RLS canary: tenant B's trends do not include tenant A's revenue", async () => {
    const tA = await makeTenantWithCatalog({ slugPrefix: "trends-rls-a" });
    const tB = await makeTenant({ slugPrefix: "trends-rls-b" });
    const ownerB = await tokens.mintPair({
      userId: tB.userId,
      tenantId: tB.tenantId,
      role: "owner",
    });
    // Heavy sale in tenant A — must not surface in tenant B's response.
    await seedSale({
      tenantId: tA.tenantId,
      branchId: tA.branchId,
      productId: tA.products[0]!.id,
      qty: 10,
      unitPriceCents: 9999n,
      cogsCents: 1000n,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/reports/trends?currency=USD&metric=revenue&window=30")
      .set("Authorization", `Bearer ${ownerB.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.current_total).toBe(0);
    for (const p of res.body.series) {
      expect(p.value).toBe(0);
    }
  });
});
