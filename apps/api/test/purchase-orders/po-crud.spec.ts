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
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * CRUD coverage for /v1/purchase-orders — create, update, list, soft-delete.
 * State-machine transitions live in po-state-machine.spec.ts.
 */
describe("Purchase-order CRUD (/v1/purchase-orders)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let cashierToken: string;
  let supplierId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "po-crud" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

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
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    const supplier = await adminPrisma.supplier.create({
      data: {
        tenant_id: t.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Crud Supplier", ar: "Crud Supplier" },
        currency_code: "USD",
        contact_email: "crud-supplier@example.test",
      },
    });
    supplierId = supplier.id;

    // Catalog: list products with this supplier so unit_cost_cents can be omitted.
    for (const p of t.products) {
      await adminPrisma.supplierProduct.create({
        data: {
          tenant_id: t.tenantId,
          supplier_id: supplierId,
          product_id: p.id,
          unit_cost_cents: p.cost_cents,
          currency_code: "USD",
        },
      });
    }
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("POST happy: owner creates a draft PO with computed totals + audit", async () => {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        expected_at: "2030-12-01",
        notes: "Initial restock",
        tax_cents: 250,
        shipping_cents: 100,
        lines: [
          { product_id: t.products[0]!.id, qty_ordered: 5, unit_cost_cents: 1000 },
          { product_id: t.products[1]!.id, qty_ordered: 2, unit_cost_cents: 2000 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^PO-/);
    expect(res.body.status).toBe("draft");
    expect(res.body.line_count).toBe(2);
    // subtotal = 5*1000 + 2*2000 = 9000
    expect(res.body.subtotal_cents).toBe("9000");
    expect(res.body.tax_cents).toBe("250");
    expect(res.body.shipping_cents).toBe("100");
    // total = 9000 + 250 + 100 = 9350
    expect(res.body.total_cents).toBe("9350");
    expect(res.body.supplier.id).toBe(supplierId);
    expect(res.body.branch.id).toBe(t.branchId);
    expect(res.body.has_discrepancy).toBe(false);

    const audit = await readAuditLog(t.tenantId, "purchase_order_created");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("POST 400 duplicate_product when the same product appears twice", async () => {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [
          { product_id: t.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
          { product_id: t.products[0]!.id, qty_ordered: 2, unit_cost_cents: 200 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("duplicate_product");
  });

  it("POST 422 unknown_product when product belongs to another tenant", async () => {
    const other = await makeTenant({ slugPrefix: "po-other" });
    const otherProd = await adminPrisma.product.create({
      data: {
        tenant_id: other.tenantId,
        sku: `OTH-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Other", ar: "Other" },
        price_cents: 100n,
        cost_cents: 50n,
        currency_code: "USD",
        is_active: true,
      },
    });
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: otherProd.id, qty_ordered: 1, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_product");
  });

  it("POST 422 product_not_in_catalog when unit_cost_cents omitted with no catalog row", async () => {
    // Create a fresh product NOT linked to this supplier via supplier_products.
    const orphan = await adminPrisma.product.create({
      data: {
        tenant_id: t.tenantId,
        sku: `ORP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Orphan", ar: "Orphan" },
        price_cents: 100n,
        cost_cents: 50n,
        currency_code: "USD",
        is_active: true,
      },
    });
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: orphan.id, qty_ordered: 3 }],
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("product_not_in_catalog");
  });

  it("POST as cashier returns 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("POST falls back to catalog unit_cost_cents when omitted", async () => {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 4 }],
      });
    expect(res.status).toBe(201);
    // products[0].cost_cents = 1200n; subtotal = 4 * 1200 = 4800
    expect(res.body.subtotal_cents).toBe("4800");
    expect(res.body.total_cents).toBe("4800");
  });

  it("PATCH happy: updates draft lines + recomputes totals", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 1, unit_cost_cents: 500 }],
      });
    const id = create.body.id as string;
    const res = await request(booted.http)
      .patch(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        notes: "Patched",
        tax_cents: 50,
        shipping_cents: 0,
        lines: [
          { product_id: t.products[0]!.id, qty_ordered: 3, unit_cost_cents: 500 },
          { product_id: t.products[2]!.id, qty_ordered: 2, unit_cost_cents: 1000 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Patched");
    // 3*500 + 2*1000 = 1500 + 2000 = 3500; total = 3500 + 50 = 3550
    expect(res.body.subtotal_cents).toBe("3500");
    expect(res.body.total_cents).toBe("3550");
    expect(res.body.line_count).toBe(2);
  });

  it("PATCH 409 purchase_order_locked once status='ordered'", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 }],
      });
    const id = create.body.id as string;
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    const res = await request(booted.http)
      .patch(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 2, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("purchase_order_locked");
  });

  it("DELETE soft-deletes a draft + idempotent", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 }],
      });
    const id = create.body.id as string;
    const r1 = await request(booted.http)
      .delete(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.deleted_at).toBeTruthy();
    const r2 = await request(booted.http)
      .delete(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r2.status).toBe(200);
  });

  it("DELETE 409 not_deletable when status='received'", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 }],
      });
    const id = create.body.id as string;
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    const detail = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const lineId = detail.body.lines[0].id as string;
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: lineId, qty_received: 1 }] });
    const res = await request(booted.http)
      .delete(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_deletable");
  });

  it("GET list filters by status=draft", async () => {
    const res = await request(booted.http)
      .get("/v1/purchase-orders?status=draft")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: { status: string }) => r.status === "draft")).toBe(true);
  });
});
