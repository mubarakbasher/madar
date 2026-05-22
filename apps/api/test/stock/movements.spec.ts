/**
 * Stock-movements ledger — GET /v1/stock-movements.
 *
 * Covers the response shape (new fields: created_by_name + product_name_i18n),
 * RBAC, kind + created_by filtering, and the RLS canary. Endpoint shipped in
 * 1.9 without dedicated tests — this is the first spec for it.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, makeTenantWithCatalog } from "../helpers/fixtures";

describe("GET /v1/stock-movements — ledger", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  let fix: Awaited<ReturnType<typeof makeTenantWithCatalog>>;
  let ownerToken: string;
  let cashierUserId: string;
  let cashierToken: string;

  let tenantB: Awaited<ReturnType<typeof makeTenant>>;
  let ownerTokenB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    fix = await makeTenantWithCatalog({ slugPrefix: "mov-a" });
    ownerToken = (
      await tokens.mintPair({ userId: fix.userId, tenantId: fix.tenantId, role: "owner" })
    ).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: fix.tenantId,
        email: `mov-cash-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier Mira",
        role: "cashier",
        branch_id: fix.branchId,
        locale: "en",
      },
    });
    cashierUserId = cashier.id;
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: fix.tenantId, role: "cashier" })
    ).access_token;

    // Ring one cash sale of qty 1 of products[0] (3500 cents) — this populates
    // one `sale` stock_movement with qty_delta=-1.
    const sale = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: fix.products[0]!.id, qty: 1, line_discount_cents: 0, note: null }],
        cash_tendered_cents: 4000,
      });
    expect(sale.status).toBe(201);

    tenantB = await makeTenant({ slugPrefix: "mov-b" });
    ownerTokenB = (
      await tokens.mintPair({ userId: tenantB.userId, tenantId: tenantB.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("cashier role: 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .get("/v1/stock-movements")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("happy: response includes created_by_name + product_name_i18n", async () => {
    const res = await request(booted.http)
      .get("/v1/stock-movements")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const saleRow = res.body.items.find(
      (m: { kind: string; product_id: string }) =>
        m.kind === "sale" && m.product_id === fix.products[0]!.id,
    );
    expect(saleRow).toBeDefined();
    expect(saleRow.qty_delta).toBe(-1);
    expect(saleRow.branch_code).toBeTruthy();
    expect(saleRow.product_sku).toBe(fix.products[0]!.sku);
    expect(saleRow.product_name_i18n).toEqual({
      en: expect.any(String),
      ar: expect.any(String),
    });
    expect(saleRow.product_name_i18n.en.length).toBeGreaterThan(0);
    expect(saleRow.product_name_i18n.ar.length).toBeGreaterThan(0);
    expect(saleRow.created_by_name).toBe("Cashier Mira");
    expect(saleRow.reference_table).toBe("sales");
  });

  it("kind filter: kind=sale returns the sale; kind=receive returns 0", async () => {
    const saleOnly = await request(booted.http)
      .get("/v1/stock-movements?kind=sale")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(saleOnly.status).toBe(200);
    expect(saleOnly.body.items.length).toBeGreaterThan(0);
    expect(saleOnly.body.items.every((m: { kind: string }) => m.kind === "sale")).toBe(true);

    const receiveOnly = await request(booted.http)
      .get("/v1/stock-movements?kind=receive")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(receiveOnly.status).toBe(200);
    expect(receiveOnly.body.items.length).toBe(0);
  });

  it("created_by filter narrows to the cashier; another user id returns 0", async () => {
    const owned = await request(booted.http)
      .get(`/v1/stock-movements?created_by=${cashierUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(owned.status).toBe(200);
    expect(owned.body.items.length).toBeGreaterThan(0);
    expect(
      owned.body.items.every((m: { created_by: string | null }) => m.created_by === cashierUserId),
    ).toBe(true);

    const noise = await request(booted.http)
      .get(`/v1/stock-movements?created_by=${fix.userId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(noise.status).toBe(200);
    // The owner hasn't rung any sales in this fixture.
    expect(noise.body.items.length).toBe(0);
  });

  it("RLS canary: tenant B sees zero of tenant A's movements", async () => {
    const res = await request(booted.http)
      .get("/v1/stock-movements")
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(0);
    expect(res.body.total).toBe(0);
  });
});
