import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

describe("POST /v1/sales — RLS two-tenant canary", () => {
  let booted: BootedTestApp;
  let A: TenantWithCatalogFixture;
  let B: TenantWithCatalogFixture;

  beforeAll(async () => {
    booted = await bootTestApp();
    A = await makeTenantWithCatalog({ slugPrefix: "rls-A" });
    B = await makeTenantWithCatalog({ slugPrefix: "rls-B" });
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("tenant A's access token cannot reference tenant B's product → 422 unknown_product", async () => {
    const tokenA = (
      await booted.app.get(TokenService).mintPair({ userId: A.userId, tenantId: A.tenantId, role: "owner" })
    ).access_token;
    const bogusFromBPerspective = B.products[0]!.id;
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: A.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: bogusFromBPerspective, qty: 1, line_discount_cents: 0 }],
        cash_tendered_cents: 10000,
      });
    // RLS hides the product from tenant A's scoped query, so the service
    // reports it as unknown — same path as a truly non-existent UUID.
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "unknown_product" });
  });

  it("tenant A cannot reference tenant B's branch → 422 unknown_branch", async () => {
    const tokenA = (
      await booted.app.get(TokenService).mintPair({ userId: A.userId, tenantId: A.tenantId, role: "owner" })
    ).access_token;
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: B.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: A.products[0]!.id, qty: 1, line_discount_cents: 0 }],
        cash_tendered_cents: 10000,
      });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "unknown_branch" });
  });

  it("sale created by tenant A is invisible to tenant B's GET /v1/sales/:id", async () => {
    const tokenA = (
      await booted.app.get(TokenService).mintPair({ userId: A.userId, tenantId: A.tenantId, role: "owner" })
    ).access_token;
    const tokenB = (
      await booted.app.get(TokenService).mintPair({ userId: B.userId, tenantId: B.tenantId, role: "owner" })
    ).access_token;

    const created = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: A.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: A.products[0]!.id, qty: 1, line_discount_cents: 0 }],
        cash_tendered_cents: 10000,
      });
    expect(created.status).toBe(201);

    // Tenant B asks for the same sale id — RLS hides it.
    const cross = await request(booted.http)
      .get(`/v1/sales/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(cross.status).toBe(404);

    // Tenant A can read it.
    const own = await request(booted.http)
      .get(`/v1/sales/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(own.status).toBe(200);

    // Sanity — adminPrisma sees both tenants' sales.
    const all = await adminPrisma.sale.findMany({
      where: { tenant_id: { in: [A.tenantId, B.tenantId] } },
    });
    expect(all.some((s) => s.id === created.body.id && s.tenant_id === A.tenantId)).toBe(true);
  });
});
