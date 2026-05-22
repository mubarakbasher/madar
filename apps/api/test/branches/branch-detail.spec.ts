import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("GET /v1/branches/:id (branch detail)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let tA: TenantWithCatalogFixture;
  let tB: TenantWithCatalogFixture;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    tA = await makeTenantWithCatalog({ slugPrefix: "branch-detail-a" });
    tB = await makeTenantWithCatalog({ slugPrefix: "branch-detail-b" });
    tokenA = (await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })).access_token;
    tokenB = (await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })).access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns full detail shape (basics + kpis + users + recent_activity)", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${tA.branchId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tA.branchId);
    expect(res.body.name_i18n).toEqual({ en: "Main", ar: "الرئيسي" });
    expect(res.body.currency_code).toBe("USD");
    expect(res.body.timezone).toBe("Africa/Cairo");
    expect(res.body.kpis).toBeDefined();
    expect(typeof res.body.kpis.today_revenue_cents).toBe("string");
    expect(typeof res.body.kpis.week_revenue_cents).toBe("string");
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(Array.isArray(res.body.recent_activity)).toBe(true);
  });

  it("KPIs reflect a seeded sale (today_revenue + transactions_today both bump)", async () => {
    // Seed a sale for tA.branchId.
    const product = tA.products[0]!;
    const sale = await adminPrisma.sale.create({
      data: {
        tenant_id: tA.tenantId,
        branch_id: tA.branchId,
        code: `TX-${randomUUID().slice(0, 6).toUpperCase()}`,
        cashier_id: tA.userId,
        subtotal_cents: product.price_cents,
        total_cents: product.price_cents,
        currency_code: "USD",
        payment_method: "cash",
        payment_status: "paid",
        client_uuid: randomUUID(),
      },
    });
    await adminPrisma.saleLine.create({
      data: {
        tenant_id: tA.tenantId,
        sale_id: sale.id,
        product_id: product.id,
        qty: 1,
        unit_price_cents: product.price_cents,
        line_total_cents: product.price_cents,
        cogs_snapshot_cents: product.cost_cents,
      },
    });

    const res = await request(booted.http)
      .get(`/v1/branches/${tA.branchId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.kpis.today_revenue_cents)).toBeGreaterThanOrEqual(Number(product.price_cents));
    expect(res.body.kpis.transactions_today).toBeGreaterThanOrEqual(1);
    expect(res.body.kpis.top_product_id).toBe(product.id);
  });

  it("404 on unknown id", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${randomUUID()}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("branch_not_found");
  });

  it("RLS canary: tenant B cannot see tenant A's branch detail (404)", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${tA.branchId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});
