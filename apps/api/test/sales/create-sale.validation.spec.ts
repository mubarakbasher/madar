import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("POST /v1/sales — validation + payment-method guards", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "sale-validate" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  function postSale(body: Record<string, unknown>) {
    return request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  it("422 unknown_product when a line references a bogus product UUID", async () => {
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: randomUUID(), qty: 1, line_discount_cents: 0 }],
      cash_tendered_cents: 10000,
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "unknown_product" });
  });

  it("422 unknown_branch when branch_id is a bogus UUID", async () => {
    const res = await postSale({
      branch_id: randomUUID(),
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: t.products[0]!.id, qty: 1, line_discount_cents: 0 }],
      cash_tendered_cents: 10000,
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "unknown_branch" });
  });

  it("400 zod on negative qty", async () => {
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: t.products[0]!.id, qty: -1, line_discount_cents: 0 }],
      cash_tendered_cents: 10000,
    });
    expect(res.status).toBe(400);
  });

  it("400 zod on non-uuid client_uuid", async () => {
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: "not-a-uuid",
      client_sequence: 1,
      lines: [{ product_id: t.products[0]!.id, qty: 1, line_discount_cents: 0 }],
      cash_tendered_cents: 10000,
    });
    expect(res.status).toBe(400);
  });

  it("400 zod when cash payment is missing cash_tendered_cents", async () => {
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: t.products[0]!.id, qty: 1, line_discount_cents: 0 }],
      // no cash_tendered_cents
    });
    expect(res.status).toBe(400);
  });

  it("400 insufficient_tendered when cash is less than total", async () => {
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: t.products[0]!.id, qty: 1, line_discount_cents: 0 }], // 3500
      cash_tendered_cents: 100, // way under
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "insufficient_tendered" });
  });

  it("400 zod on empty lines array", async () => {
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [],
      cash_tendered_cents: 10000,
    });
    expect(res.status).toBe(400);
  });
});
