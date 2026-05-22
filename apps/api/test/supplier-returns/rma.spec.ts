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
  readBranchStock,
  readStockMovements,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * Coverage for /v1/supplier-returns — CRUD, state machine, role/branch
 * scoping, RLS canary, and impersonation block. Smaller surface than POs
 * (no PDF / no email), so this lives in one spec file.
 *
 * State machine: draft → sent → refunded | cancelled. `draft → sent` writes
 * one `stock_movements` row per line with kind='adjustment' +
 * reference_table='supplier_returns' and decrements branch_stock.qty_on_hand
 * (negatives allowed).
 */
describe("Supplier returns (RMA) — /v1/supplier-returns", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let tA: TenantWithCatalogFixture;
  let tB: TenantWithCatalogFixture;
  let ownerTokenA: string;
  let ownerTokenB: string;
  let cashierTokenA: string;
  let managerWrongBranchToken: string;
  let secondBranchA: string;
  let supplierA: string;
  let supplierB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    tA = await makeTenantWithCatalog({ slugPrefix: "rma-a" });
    tB = await makeTenantWithCatalog({ slugPrefix: "rma-b" });

    ownerTokenA = (
      await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })
    ).access_token;
    ownerTokenB = (
      await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })
    ).access_token;

    // Cashier on tenant A — used for role-gate negative tests.
    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: tA.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    cashierTokenA = (
      await tokens.mintPair({ userId: cashier.id, tenantId: tA.tenantId, role: "cashier" })
    ).access_token;

    // Manager pinned to a SECOND branch on tA — used for wrong-branch test.
    const secondBranch = await adminPrisma.branch.create({
      data: {
        tenant_id: tA.tenantId,
        code: `B2-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Second", ar: "Second" },
        currency_code: "USD",
      },
    });
    secondBranchA = secondBranch.id;

    const managerWrongBranch = await adminPrisma.user.create({
      data: {
        tenant_id: tA.tenantId,
        email: `mgr-wrong-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Wrong Mgr",
        role: "manager",
        locale: "en",
        branch_id: secondBranchA,
      },
    });
    managerWrongBranchToken = (
      await tokens.mintPair({
        userId: managerWrongBranch.id,
        tenantId: tA.tenantId,
        role: "manager",
      })
    ).access_token;

    const sA = await adminPrisma.supplier.create({
      data: {
        tenant_id: tA.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "RMA Supplier A", ar: "RMA A" },
        currency_code: "USD",
      },
    });
    supplierA = sA.id;
    const sB = await adminPrisma.supplier.create({
      data: {
        tenant_id: tB.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "RMA Supplier B", ar: "RMA B" },
        currency_code: "USD",
      },
    });
    supplierB = sB.id;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  async function makeDraft(opts?: {
    productIndex?: number;
    qty?: number;
    unitCost?: number;
    extraLines?: Array<{ productIndex: number; qty: number; unitCost: number }>;
    reason?: string;
    branchId?: string;
    token?: string;
  }): Promise<string> {
    const productIndex = opts?.productIndex ?? 0;
    const qty = opts?.qty ?? 4;
    const unitCost = opts?.unitCost ?? 500;
    const lines = [
      {
        product_id: tA.products[productIndex]!.id,
        qty,
        unit_cost_cents: unitCost,
        reason_code: "damaged",
      },
      ...(opts?.extraLines ?? []).map((e) => ({
        product_id: tA.products[e.productIndex]!.id,
        qty: e.qty,
        unit_cost_cents: e.unitCost,
      })),
    ];
    const res = await request(booted.http)
      .post("/v1/supplier-returns")
      .set("Authorization", `Bearer ${opts?.token ?? ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: opts?.branchId ?? tA.branchId,
        reason: opts?.reason ?? "Defective batch",
        lines,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  // 1. POST happy + computed totals + audit row exists
  it("POST happy: owner creates draft RMA with computed totals + audit", async () => {
    const res = await request(booted.http)
      .post("/v1/supplier-returns")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        reason: "Damaged on arrival",
        notes: "Original packaging compromised.",
        lines: [
          {
            product_id: tA.products[0]!.id,
            qty: 5,
            unit_cost_cents: 1000,
            reason_code: "damaged",
          },
          {
            product_id: tA.products[1]!.id,
            qty: 2,
            unit_cost_cents: 2000,
            reason_code: "wrong_item",
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^RMA-/);
    expect(res.body.status).toBe("draft");
    expect(res.body.line_count).toBe(2);
    // total = 5*1000 + 2*2000 = 9000
    expect(res.body.total_cents).toBe("9000");
    expect(res.body.currency_code).toBe("USD");
    expect(res.body.reason).toBe("Damaged on arrival");
    expect(res.body.supplier.id).toBe(supplierA);
    expect(res.body.branch.id).toBe(tA.branchId);
    expect(res.body.lines[0].line_total_cents).toBe("5000");
    expect(res.body.lines[1].line_total_cents).toBe("4000");
    expect(res.body.lines.find((l: { reason_code: string }) => l.reason_code === "damaged")).toBeTruthy();

    const audit = await readAuditLog(tA.tenantId, "supplier_return_created");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0]!.after).toMatchObject({
      supplier_id: supplierA,
      branch_id: tA.branchId,
      line_count: 2,
      total_cents: "9000",
    });
  });

  // 2. POST 400 duplicate_product
  it("POST 400 duplicate_product when same product appears twice", async () => {
    const res = await request(booted.http)
      .post("/v1/supplier-returns")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        reason: "Dup test",
        lines: [
          { product_id: tA.products[0]!.id, qty: 1, unit_cost_cents: 100 },
          { product_id: tA.products[0]!.id, qty: 2, unit_cost_cents: 200 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("duplicate_product");
  });

  // 3. POST 422 unknown_supplier (foreign tenant supplier)
  it("POST 422 unknown_supplier when supplier belongs to another tenant", async () => {
    const res = await request(booted.http)
      .post("/v1/supplier-returns")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierB,
        branch_id: tA.branchId,
        reason: "Cross-tenant",
        lines: [{ product_id: tA.products[0]!.id, qty: 1, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_supplier");
  });

  // 4. POST 422 unknown_product (foreign tenant product)
  it("POST 422 unknown_product when product belongs to another tenant", async () => {
    const other = await makeTenant({ slugPrefix: "rma-other" });
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
      .post("/v1/supplier-returns")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        reason: "Cross-tenant product",
        lines: [{ product_id: otherProd.id, qty: 1, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_product");
    expect(res.body.fields?.product_id).toBe(otherProd.id);
  });

  // 5. POST 403 cashier
  it("POST as cashier returns 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .post("/v1/supplier-returns")
      .set("Authorization", `Bearer ${cashierTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        reason: "Cashier attempt",
        lines: [{ product_id: tA.products[0]!.id, qty: 1, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  // 6. draft → sent writes stock_movements + decrements branch_stock
  it("draft → sent writes stock_movements(kind=adjustment, ref=supplier_returns) + decrements branch_stock", async () => {
    const id = await makeDraft({
      productIndex: 0,
      qty: 3,
      unitCost: 500,
      extraLines: [{ productIndex: 1, qty: 2, unitCost: 1500 }],
    });
    const beforeQty0 = (await readBranchStock(tA.tenantId, tA.branchId, tA.products[0]!.id)) ?? 0;
    const beforeQty1 = (await readBranchStock(tA.tenantId, tA.branchId, tA.products[1]!.id)) ?? 0;

    const res = await request(booted.http)
      .post(`/v1/supplier-returns/${id}/send`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
    expect(res.body.sent_at).toBeTruthy();

    const afterQty0 = (await readBranchStock(tA.tenantId, tA.branchId, tA.products[0]!.id)) ?? 0;
    const afterQty1 = (await readBranchStock(tA.tenantId, tA.branchId, tA.products[1]!.id)) ?? 0;
    expect(afterQty0).toBe(beforeQty0 - 3);
    expect(afterQty1).toBe(beforeQty1 - 2);

    const mv0 = await readStockMovements(tA.tenantId, tA.products[0]!.id);
    expect(
      mv0.some(
        (m) =>
          m.kind === "adjustment" &&
          m.qty_delta === -3 &&
          m.reference_table === "supplier_returns",
      ),
    ).toBe(true);
    const mv1 = await readStockMovements(tA.tenantId, tA.products[1]!.id);
    expect(
      mv1.some(
        (m) =>
          m.kind === "adjustment" &&
          m.qty_delta === -2 &&
          m.reference_table === "supplier_returns",
      ),
    ).toBe(true);

    const audit = await readAuditLog(tA.tenantId, "supplier_return_sent");
    expect(audit.length).toBeGreaterThan(0);
  });

  // 7. sent → refunded writes audit but NO new stock_movement
  it("sent → refunded writes audit but adds NO new stock_movement", async () => {
    const id = await makeDraft({ productIndex: 2, qty: 1, unitCost: 800 });
    // Get pre-send movement count for product[2].
    await request(booted.http)
      .post(`/v1/supplier-returns/${id}/send`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    const movementsBefore = await readStockMovements(tA.tenantId, tA.products[2]!.id);

    const res = await request(booted.http)
      .post(`/v1/supplier-returns/${id}/refund`)
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .send({ notes: "Wire received 2026-05-19" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("refunded");
    expect(res.body.refunded_at).toBeTruthy();
    // Notes were appended.
    expect(res.body.notes).toContain("Wire received 2026-05-19");

    const movementsAfter = await readStockMovements(tA.tenantId, tA.products[2]!.id);
    expect(movementsAfter.length).toBe(movementsBefore.length);

    const audit = await readAuditLog(tA.tenantId, "supplier_return_refunded");
    expect(audit.length).toBeGreaterThan(0);
  });

  // 8. cancel from sent → 409 not_draft
  it("cancel 409 not_draft once status='sent'", async () => {
    const id = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    await request(booted.http)
      .post(`/v1/supplier-returns/${id}/send`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    const res = await request(booted.http)
      .post(`/v1/supplier-returns/${id}/cancel`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_draft");
  });

  // 9. PATCH 409 once status=sent
  it("PATCH 409 not_draft once status='sent'", async () => {
    const id = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    await request(booted.http)
      .post(`/v1/supplier-returns/${id}/send`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    const res = await request(booted.http)
      .patch(`/v1/supplier-returns/${id}`)
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        reason: "Updated",
        lines: [{ product_id: tA.products[0]!.id, qty: 2, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_draft");
  });

  // 10. DELETE happy + idempotent; DELETE 409 once status=sent
  it("DELETE soft-deletes a draft (idempotent) and 409s once status='sent'", async () => {
    const deletable = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    const r1 = await request(booted.http)
      .delete(`/v1/supplier-returns/${deletable}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(r1.status).toBe(200);
    expect(r1.body.deleted_at).toBeTruthy();
    const r2 = await request(booted.http)
      .delete(`/v1/supplier-returns/${deletable}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(r2.status).toBe(200);

    const sent = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    await request(booted.http)
      .post(`/v1/supplier-returns/${sent}/send`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    const blocked = await request(booted.http)
      .delete(`/v1/supplier-returns/${sent}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("not_deletable");
  });

  // 11. Manager wrong-branch → 403 on write
  it("Manager on wrong branch: 403 forbidden_branch on create + send", async () => {
    // Create attempt at tA.branchId by a manager pinned to secondBranchA.
    const res = await request(booted.http)
      .post("/v1/supplier-returns")
      .set("Authorization", `Bearer ${managerWrongBranchToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        reason: "Mgr scope test",
        lines: [{ product_id: tA.products[0]!.id, qty: 1, unit_cost_cents: 100 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_branch");

    // Send-transition attempt on an owner-created draft at tA.branchId.
    const draftId = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    const send = await request(booted.http)
      .post(`/v1/supplier-returns/${draftId}/send`)
      .set("Authorization", `Bearer ${managerWrongBranchToken}`);
    expect(send.status).toBe(403);
    expect(send.body.code).toBe("forbidden_branch");
  });

  // 12. RLS canary (tenant B blocked)
  it("RLS canary: tenant B cannot read tenant A's supplier return", async () => {
    const id = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    const res = await request(booted.http)
      .get(`/v1/supplier-returns/${id}`)
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(res.status).toBe(404);
    // Sanity: tA's owner CAN read.
    const ok = await request(booted.http)
      .get(`/v1/supplier-returns/${id}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(ok.status).toBe(200);
  });

  // 13. DELETE blocked during impersonation
  it("DELETE blocked during impersonation (403 forbidden_during_impersonation)", async () => {
    const id = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    const imper = await tokens.mintImpersonationAccess({
      tenantId: tA.tenantId,
      targetUserId: tA.userId,
      targetRole: "owner",
      impersonatorId: randomUUID(),
      impersonatorEmail: "admin@platform.test",
    });
    const res = await request(booted.http)
      .delete(`/v1/supplier-returns/${id}`)
      .set("Authorization", `Bearer ${imper.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_during_impersonation");
  });
});
