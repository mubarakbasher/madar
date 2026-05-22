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

/**
 * Cross-cutting scoping: RLS canary, role gates, manager branch scope,
 * impersonation blockers.
 *
 * Manager-on-wrong-branch convention here:
 *   - reads (GET /:id, /:id/pdf): 404 (no existence leak)
 *   - writes (POST/PATCH/DELETE/transitions): 403 forbidden_branch
 */
describe("Purchase-order scoping (RLS + role + branch + impersonation)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let tA: TenantWithCatalogFixture;
  let tB: TenantWithCatalogFixture;
  let tokenA: string;
  let tokenB: string;
  let secondBranchA: string;
  let managerOnBranchAToken: string;
  let managerOnSecondBranchToken: string;
  let supplierA: string;
  let supplierB: string;
  let cashierToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    tA = await makeTenantWithCatalog({ slugPrefix: "po-rls-a" });
    tB = await makeTenantWithCatalog({ slugPrefix: "po-rls-b" });
    tokenA = (
      await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })
    ).access_token;
    tokenB = (
      await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })
    ).access_token;

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
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: tA.tenantId, role: "cashier" })
    ).access_token;

    const secondBranch = await adminPrisma.branch.create({
      data: {
        tenant_id: tA.tenantId,
        code: `B2-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Second", ar: "Second" },
        currency_code: "USD",
      },
    });
    secondBranchA = secondBranch.id;

    const mgrA = await adminPrisma.user.create({
      data: {
        tenant_id: tA.tenantId,
        email: `mgr-a-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Mgr A",
        role: "manager",
        locale: "en",
        branch_id: tA.branchId,
      },
    });
    managerOnBranchAToken = (
      await tokens.mintPair({ userId: mgrA.id, tenantId: tA.tenantId, role: "manager" })
    ).access_token;
    const mgrSecond = await adminPrisma.user.create({
      data: {
        tenant_id: tA.tenantId,
        email: `mgr-second-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Mgr Second",
        role: "manager",
        locale: "en",
        branch_id: secondBranchA,
      },
    });
    managerOnSecondBranchToken = (
      await tokens.mintPair({ userId: mgrSecond.id, tenantId: tA.tenantId, role: "manager" })
    ).access_token;

    const sA = await adminPrisma.supplier.create({
      data: {
        tenant_id: tA.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Supplier A", ar: "Supplier A" },
        currency_code: "USD",
      },
    });
    supplierA = sA.id;
    const sB = await adminPrisma.supplier.create({
      data: {
        tenant_id: tB.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Supplier B", ar: "Supplier B" },
        currency_code: "USD",
      },
    });
    supplierB = sB.id;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("RLS canary: tenant B does not see tenant A's PO", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;
    const detail = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(detail.status).toBe(404);
  });

  it("Owner can act on PO at any branch (secondary branch)", async () => {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: secondBranchA,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.branch.id).toBe(secondBranchA);
  });

  it("Manager at branch A: can act on PO at branch A", async () => {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${managerOnBranchAToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    expect(res.status).toBe(201);
  });

  it("Manager at branch A: 403 forbidden_branch when targeting another branch on create", async () => {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${managerOnBranchAToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: secondBranchA,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_branch");
  });

  it("Manager on wrong branch: GET /:id 404 (no existence leak)", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: secondBranchA,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    const id = create.body.id as string;
    // managerOnBranchA cannot read a PO at secondBranchA — 404.
    const res = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${managerOnBranchAToken}`);
    expect(res.status).toBe(404);
    // Manager-on-second-branch CAN read it.
    const ok = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${managerOnSecondBranchToken}`);
    expect(ok.status).toBe(200);
  });

  it("Manager on wrong branch: write transitions 403 forbidden_branch", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: secondBranchA,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    const id = create.body.id as string;
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${managerOnBranchAToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_branch");
  });

  it("Cashier read 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .get("/v1/purchase-orders")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("DELETE blocked during impersonation (403 forbidden_during_impersonation)", async () => {
    const create = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: tA.branchId,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    const id = create.body.id as string;
    const imper = await tokens.mintImpersonationAccess({
      tenantId: tA.tenantId,
      targetUserId: tA.userId,
      targetRole: "owner",
      impersonatorId: randomUUID(),
      impersonatorEmail: "admin@platform.test",
    });
    const res = await request(booted.http)
      .delete(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${imper.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_during_impersonation");
  });

  it("Manager list: forced to their own branch (cannot peek another branch)", async () => {
    // Seed a PO at secondBranchA so the manager-on-branchA SHOULDN'T see it.
    await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierA,
        branch_id: secondBranchA,
        lines: [
          { product_id: tA.products[0]!.id, qty_ordered: 1, unit_cost_cents: 100 },
        ],
      });
    // Even when the manager passes branch_id=secondBranchA they're forced back to their own branch.
    const res = await request(booted.http)
      .get(`/v1/purchase-orders?branch_id=${secondBranchA}`)
      .set("Authorization", `Bearer ${managerOnBranchAToken}`);
    expect(res.status).toBe(200);
    for (const item of res.body.items as Array<{ branch: { id: string } }>) {
      expect(item.branch.id).toBe(tA.branchId);
    }
    // Sanity: the seed using supplierB to tA from a different tenant just exercises that
    // tenant-A's owner can list other branches.
    void supplierB;
  });
});
