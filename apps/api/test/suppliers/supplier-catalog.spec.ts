import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenant,
  makeTenantWithCatalog,
  readAuditLog,
  type TenantFixture,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

async function createSupplier(
  http: BootedTestApp["http"],
  token: string,
): Promise<string> {
  const res = await request(http)
    .post("/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", randomUUID())
    .send({
      code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
      name_i18n: { en: "Catalog Supplier", ar: "مورد كتالوج" },
      currency_code: "USD",
    });
  if (res.status !== 201) throw new Error(`failed to create supplier: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

describe("Supplier catalog (/v1/suppliers/:id/catalog)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let otherTenant: TenantFixture;
  let otherOwnerToken: string;
  let otherProductId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "supp-cat" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    otherTenant = await makeTenant({ slugPrefix: "supp-cat-rls" });
    otherOwnerToken = (
      await tokens.mintPair({
        userId: otherTenant.userId,
        tenantId: otherTenant.tenantId,
        role: "owner",
      })
    ).access_token;

    // Seed a product in the OTHER tenant for the cross-tenant 422 test.
    const product = await adminPrisma.product.create({
      data: {
        tenant_id: otherTenant.tenantId,
        sku: `X-${randomUUID().slice(0, 4)}`,
        name_i18n: { en: "Foreign", ar: "أجنبي" },
        price_cents: 100n,
        cost_cents: 50n,
        currency_code: "USD",
        is_active: true,
      },
    });
    otherProductId = product.id;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("POST catalog happy + audit row", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    const res = await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        product_id: t.products[0]!.id,
        supplier_sku: "VEN-001",
        unit_cost_cents: 1234,
        is_preferred: false,
      });
    expect(res.status).toBe(201);
    expect(res.body.product_id).toBe(t.products[0]!.id);
    expect(res.body.unit_cost_cents).toBe("1234");
    expect(res.body.is_preferred).toBe(false);

    const audit = await readAuditLog(t.tenantId, "supplier_product_added");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("PATCH/DELETE round-trip", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    const add = await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        product_id: t.products[0]!.id,
        unit_cost_cents: 500,
      });
    expect(add.status).toBe(201);

    const patch = await request(booted.http)
      .patch(`/v1/suppliers/${supplierId}/catalog/${t.products[0]!.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ unit_cost_cents: 750, supplier_sku: "VEN-NEW" });
    expect(patch.status).toBe(200);
    expect(patch.body.unit_cost_cents).toBe("750");
    expect(patch.body.supplier_sku).toBe("VEN-NEW");

    const del = await request(booted.http)
      .delete(`/v1/suppliers/${supplierId}/catalog/${t.products[0]!.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted_at).toBeTruthy();

    // After deletion, the catalog GET should not include this row.
    const list = await request(booted.http)
      .get(`/v1/suppliers/${supplierId}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.find((r: { product_id: string }) => r.product_id === t.products[0]!.id)).toBeUndefined();
  });

  it("is_preferred: creating B as preferred flips A to false", async () => {
    const supplierA = await createSupplier(booted.http, ownerToken);
    const supplierB = await createSupplier(booted.http, ownerToken);
    // Use a product not touched by prior tests.
    const productId = t.products[1]!.id;

    const addA = await request(booted.http)
      .post(`/v1/suppliers/${supplierA}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ product_id: productId, unit_cost_cents: 500, is_preferred: true });
    expect(addA.status).toBe(201);
    expect(addA.body.is_preferred).toBe(true);

    const addB = await request(booted.http)
      .post(`/v1/suppliers/${supplierB}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ product_id: productId, unit_cost_cents: 600, is_preferred: true });
    expect(addB.status).toBe(201);
    expect(addB.body.is_preferred).toBe(true);

    // Supplier A's catalog row for this product should be flipped to false.
    const aList = await request(booted.http)
      .get(`/v1/suppliers/${supplierA}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(aList.status).toBe(200);
    const aRow = aList.body.find((r: { product_id: string }) => r.product_id === productId);
    expect(aRow).toBeTruthy();
    expect(aRow.is_preferred).toBe(false);

    // Supplier B's catalog row should be the only preferred one for this product.
    const bList = await request(booted.http)
      .get(`/v1/suppliers/${supplierB}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(bList.status).toBe(200);
    const bRow = bList.body.find((r: { product_id: string }) => r.product_id === productId);
    expect(bRow.is_preferred).toBe(true);
  });

  it("RLS canary: tenant B cannot read tenant A's catalog", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ product_id: t.products[2]!.id, unit_cost_cents: 999 });

    const peek = await request(booted.http)
      .get(`/v1/suppliers/${supplierId}/catalog`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(peek.status).toBe(404);
  });

  it("422 when product belongs to another tenant", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    const res = await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/catalog`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ product_id: otherProductId, unit_cost_cents: 100 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_product");
  });
});
