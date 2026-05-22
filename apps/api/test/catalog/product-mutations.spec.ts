import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, readAuditLog, readBranchStock, type TenantWithCatalogFixture } from "../helpers/fixtures";
import { adminPrisma } from "@madar/db";

describe("Product mutations (POST/PATCH/DELETE /v1/products)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "cat-prod" });
    const ownerPair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    ownerToken = ownerPair.access_token;
    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    const cashierPair = await tokens.mintPair({
      userId: cashier.id,
      tenantId: t.tenantId,
      role: "cashier",
    });
    cashierToken = cashierPair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("POST /v1/products creates a product, writes audit, returns shape with stock=0", async () => {
    const sku = `NEW-${randomUUID().slice(0, 6).toUpperCase()}`;
    const res = await request(booted.http)
      .post("/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sku,
        name_i18n: { en: "Test Latte", ar: "لاتيه اختبار" },
        price_cents: 5500,
        cost_cents: 1800,
        currency_code: "USD",
      });

    expect(res.status).toBe(201);
    expect(res.body.sku).toBe(sku);
    expect(res.body.name_i18n).toEqual({ en: "Test Latte", ar: "لاتيه اختبار" });
    expect(res.body.price_cents).toBe("5500");
    expect(res.body.cost_cents).toBe("1800");
    expect(res.body.qty_on_hand).toBe(0);

    const audit = await readAuditLog(t.tenantId, "product_created");
    expect(audit.some((r) => (r.after as { sku?: string })?.sku === sku)).toBe(true);
  });

  it("POST /v1/products with initial_stock writes branch_stock + stock_movement", async () => {
    const sku = `STK-${randomUUID().slice(0, 6).toUpperCase()}`;
    const res = await request(booted.http)
      .post("/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sku,
        name_i18n: { en: "Stocked Item", ar: "بضاعة مخزنة" },
        price_cents: 1000,
        cost_cents: 400,
        currency_code: "USD",
        initial_stock: [
          { branch_id: t.branchId, qty: 12, reorder_point: 4, reorder_qty: 20 },
        ],
      });

    expect(res.status).toBe(201);
    const productId = res.body.id as string;
    const qty = await readBranchStock(t.tenantId, t.branchId, productId);
    expect(qty).toBe(12);
    const movements = await adminPrisma.stockMovement.findMany({
      where: { tenant_id: t.tenantId, product_id: productId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.kind).toBe("adjustment");
    expect(movements[0]!.qty_delta).toBe(12);
  });

  it("POST /v1/products with duplicate SKU returns 409 sku_taken", async () => {
    const sku = `DUP-${randomUUID().slice(0, 6).toUpperCase()}`;
    const first = await request(booted.http)
      .post("/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sku,
        name_i18n: { en: "First", ar: "أول" },
        price_cents: 100,
        cost_cents: 50,
        currency_code: "USD",
      });
    expect(first.status).toBe(201);
    const res = await request(booted.http)
      .post("/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sku,
        name_i18n: { en: "Duplicate", ar: "مكرر" },
        price_cents: 100,
        cost_cents: 50,
        currency_code: "USD",
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("sku_taken");
  });

  it("POST /v1/products rejects missing Arabic name with 400", async () => {
    const res = await request(booted.http)
      .post("/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sku: `BAD-${randomUUID().slice(0, 6).toUpperCase()}`,
        name_i18n: { en: "Only English", ar: "" },
        price_cents: 100,
        cost_cents: 50,
        currency_code: "USD",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("POST /v1/products as cashier returns 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .post("/v1/products")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sku: `CR-${randomUUID().slice(0, 6).toUpperCase()}`,
        name_i18n: { en: "Cashier Blocked", ar: "محظور" },
        price_cents: 100,
        cost_cents: 50,
        currency_code: "USD",
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("PATCH /v1/products/:id updates price + writes audit", async () => {
    const target = t.products[0]!;
    const res = await request(booted.http)
      .patch(`/v1/products/${target.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ price_cents: 4200 });
    expect(res.status).toBe(200);
    expect(res.body.price_cents).toBe("4200");
    const audit = await readAuditLog(t.tenantId, "product_updated");
    expect(audit.some((r) => (r.after as { price_cents?: string })?.price_cents === "4200")).toBe(true);
  });

  it("PATCH /v1/products/:id with unknown id returns 404", async () => {
    const res = await request(booted.http)
      .patch(`/v1/products/${randomUUID()}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ price_cents: 9999 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("product_not_found");
  });

  it("DELETE /v1/products/:id soft-deletes and is idempotent", async () => {
    const target = t.products[2]!;
    const res1 = await request(booted.http)
      .delete(`/v1/products/${target.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res1.status).toBe(200);
    expect(res1.body.deleted_at).toBeTruthy();

    // Soft-deleted product no longer appears in list
    const listRes = await request(booted.http)
      .get("/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.find((p: { id: string }) => p.id === target.id)).toBeUndefined();

    // Second delete still 200 (idempotent)
    const res2 = await request(booted.http)
      .delete(`/v1/products/${target.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res2.status).toBe(200);
  });

  it("DELETE /v1/products/:id as cashier returns 403", async () => {
    const target = t.products[1]!;
    const res = await request(booted.http)
      .delete(`/v1/products/${target.id}`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });
});
