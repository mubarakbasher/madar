import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("Real velocity from stock_movements (1.8d)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "velocity-test" });
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("before any sale: velocity_per_week = 0 for all products", async () => {
    const res = await request(booted.http)
      .get("/v1/products")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    for (const p of res.body.items) {
      expect(p.velocity_per_week).toBe(0);
    }
  });

  it("after a 3-unit sale: velocity_per_week = 3 for that product, 0 for others", async () => {
    const target = t.products[0]!;
    const other = t.products[1]!;
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: t.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: target.id, qty: 3, line_discount_cents: 0, note: null }],
        cash_tendered_cents: Number(target.price_cents) * 3,
      });
    expect(res.status).toBe(201);

    const listRes = await request(booted.http)
      .get("/v1/products")
      .set("Authorization", `Bearer ${accessToken}`);
    const targetRow = listRes.body.items.find((p: { id: string }) => p.id === target.id);
    const otherRow = listRes.body.items.find((p: { id: string }) => p.id === other.id);
    expect(targetRow.velocity_per_week).toBe(3);
    expect(otherRow.velocity_per_week).toBe(0);
  });

  it("getProduct returns velocity_per_week consistently with list", async () => {
    const target = t.products[0]!;
    const res = await request(booted.http)
      .get(`/v1/products/${target.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.velocity_per_week).toBe(3);
  });

  it("a sale 8 days ago does NOT count toward 7-day window", async () => {
    const target = t.products[2]!;
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    await adminPrisma.stockMovement.create({
      data: {
        tenant_id: t.tenantId,
        branch_id: t.branchId,
        product_id: target.id,
        kind: "sale",
        qty_delta: -99,
        occurred_at: eightDaysAgo,
      },
    });
    const res = await request(booted.http)
      .get(`/v1/products/${target.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.velocity_per_week).toBe(0);
  });
});
