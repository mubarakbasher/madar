import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("Product detail + movements + activity (1.8c)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "detail-test" });
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("GET /v1/products/:id/detail returns per_branch_stock + kpis", async () => {
    const target = t.products[0]!;
    const res = await request(booted.http)
      .get(`/v1/products/${target.id}/detail`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(target.id);
    expect(Array.isArray(res.body.per_branch_stock)).toBe(true);
    expect(res.body.per_branch_stock.length).toBe(1); // one branch in fixture
    expect(res.body.per_branch_stock[0]).toMatchObject({
      branch_id: t.branchId,
      qty_on_hand: target.starting_qty,
    });
    expect(res.body.kpis).toMatchObject({
      units_sold_30d: 0,
      velocity_per_day: 0,
      days_of_cover: null, // velocity is 0
    });
    expect(res.body.kpis.total_stock_value_cents).toBe(
      (BigInt(target.starting_qty) * target.cost_cents).toString(),
    );
  });

  it("KPIs reflect a recent sale", async () => {
    const target = t.products[1]!;
    await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: t.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 2,
        lines: [{ product_id: target.id, qty: 6, line_discount_cents: 0, note: null }],
        cash_tendered_cents: Number(target.price_cents) * 6,
      });

    const res = await request(booted.http)
      .get(`/v1/products/${target.id}/detail`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.kpis.units_sold_30d).toBe(6);
    expect(res.body.kpis.velocity_per_day).toBeCloseTo(0.2, 1);
    expect(res.body.kpis.days_of_cover).toBeGreaterThan(0);
  });

  it("404 for unknown product id", async () => {
    const res = await request(booted.http)
      .get(`/v1/products/${randomUUID()}/detail`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("product_not_found");
  });

  it("GET /movements returns paginated stock_movements", async () => {
    const target = t.products[1]!;
    const res = await request(booted.http)
      .get(`/v1/products/${target.id}/movements`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0]).toMatchObject({
      kind: "sale",
      branch_code: expect.any(String),
    });
    expect(res.body.items[0].qty_delta).toBe(-6);
  });

  it("GET /activity returns audit_log entries for entity=product, entity_id=:id", async () => {
    // Create + update + delete a fresh product to generate activity rows.
    const sku = `ACT-${randomUUID().slice(0, 6).toUpperCase()}`;
    const create = await request(booted.http)
      .post("/v1/products")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sku,
        name_i18n: { en: "Activity Test", ar: "اختبار النشاط" },
        price_cents: 100,
        cost_cents: 50,
        currency_code: "USD",
      });
    expect(create.status).toBe(201);
    const newId = create.body.id as string;

    await request(booted.http)
      .patch(`/v1/products/${newId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ price_cents: 150 });

    const res = await request(booted.http)
      .get(`/v1/products/${newId}/activity`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const actions = res.body.items.map((r: { action: string }) => r.action);
    expect(actions).toContain("product_created");
    expect(actions).toContain("product_updated");
  });

  it("RLS: tenant B cannot read tenant A's product detail (404)", async () => {
    const tB = await makeTenantWithCatalog({ slugPrefix: "detail-rls-b" });
    const tBPair = await tokens.mintPair({
      userId: tB.userId,
      tenantId: tB.tenantId,
      role: "owner",
    });
    const res = await request(booted.http)
      .get(`/v1/products/${t.products[0]!.id}/detail`)
      .set("Authorization", `Bearer ${tBPair.access_token}`);
    expect(res.status).toBe(404);
  });

  it("movements pagination: ?page=2&limit=1 skips correctly", async () => {
    // Generate enough movements first.
    const target = t.products[2]!;
    for (let i = 0; i < 3; i++) {
      await adminPrisma.stockMovement.create({
        data: {
          tenant_id: t.tenantId,
          branch_id: t.branchId,
          product_id: target.id,
          kind: "adjustment",
          qty_delta: 1,
        },
      });
    }
    const p1 = await request(booted.http)
      .get(`/v1/products/${target.id}/movements?page=1&limit=1`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(p1.status).toBe(200);
    expect(p1.body.items).toHaveLength(1);
    const p2 = await request(booted.http)
      .get(`/v1/products/${target.id}/movements?page=2&limit=1`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);
  });
});
