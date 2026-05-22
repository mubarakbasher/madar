import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("GET /v1/sales/:id", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;
  let saleId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "get-sale" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;

    // Seed one sale.
    const r = await request(booted.http)
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
        lines: [{ product_id: t.products[0]!.id, qty: 2, line_discount_cents: 0, note: "decaf" }],
        cash_tendered_cents: 10000,
      });
    expect(r.status).toBe(201);
    saleId = r.body.id;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns the sale with product name expansion", async () => {
    const res = await request(booted.http)
      .get(`/v1/sales/${saleId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(saleId);
    expect(res.body.code).toMatch(/^TX-/);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].sku).toBe(t.products[0]!.sku);
    expect(res.body.lines[0].name_i18n.en).toBe("Test Product 1");
    expect(res.body.lines[0].note).toBe("decaf");
  });

  it("401 access_missing without token", async () => {
    const res = await request(booted.http).get(`/v1/sales/${saleId}`);
    expect(res.status).toBe(401);
  });

  it("404 for unknown id", async () => {
    const res = await request(booted.http)
      .get(`/v1/sales/${randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it("400 for malformed uuid in path", async () => {
    const res = await request(booted.http)
      .get(`/v1/sales/not-a-uuid`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });
});
