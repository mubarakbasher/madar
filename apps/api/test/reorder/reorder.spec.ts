import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant } from "../helpers/fixtures";

/**
 * Reorder suggestions (1.9): GET /v1/reorder/suggestions ranks SKUs that will
 * run out within the horizon (velocity) or have fallen below reorder point,
 * suggests a quantity, and groups by preferred supplier.
 */
describe("Reorder suggestions", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  // Tenant A scenario
  let tenantId: string;
  let ownerId: string;
  let branchId: string;
  let otherBranchId: string;
  let managerOnOtherBranchId: string;
  let cashierId: string;
  let supplierId: string;
  let p1: string; // fast-mover, low stock, preferred supplier
  let p2: string; // same supplier, low stock
  let p3: string; // healthy, excluded
  let p4: string; // below reorder point, no preferred supplier (ungrouped)

  let ownerToken: string;

  async function makeProduct(name: string, costCents: bigint): Promise<string> {
    const row = await adminPrisma.product.create({
      data: {
        tenant_id: tenantId,
        sku: `SKU-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: name, ar: name },
        price_cents: costCents * 3n,
        cost_cents: costCents,
        currency_code: "USD",
        is_active: true,
      },
    });
    return row.id;
  }

  async function setStock(
    productId: string,
    qty: number,
    reorderPoint: number | null,
    reorderQty: number | null,
  ): Promise<void> {
    await adminPrisma.branchStock.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        product_id: productId,
        qty_on_hand: qty,
        reorder_point: reorderPoint,
        reorder_qty: reorderQty,
      },
    });
  }

  /** Insert a recent `sale` movement so the 30-day velocity query picks it up. */
  async function sell(productId: string, units: number): Promise<void> {
    await adminPrisma.stockMovement.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        product_id: productId,
        kind: "sale",
        qty_delta: -units,
        occurred_at: new Date(Date.now() - 86_400_000), // yesterday, inside 30d
      },
    });
  }

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    const base = await makeTenant({ slugPrefix: "reorder-test" });
    tenantId = base.tenantId;
    ownerId = base.userId;

    const branch = await adminPrisma.branch.create({
      data: { tenant_id: tenantId, code: "BR-MAIN", name_i18n: { en: "Main", ar: "الرئيسي" }, currency_code: "USD" },
    });
    branchId = branch.id;
    const other = await adminPrisma.branch.create({
      data: { tenant_id: tenantId, code: "BR-WH", name_i18n: { en: "Warehouse", ar: "المستودع" }, currency_code: "USD" },
    });
    otherBranchId = other.id;

    const manager = await adminPrisma.user.create({
      data: {
        tenant_id: tenantId,
        email: `mgr-${randomUUID().slice(0, 8)}@example.test`,
        password_hash: "x",
        name: "Branch Manager",
        role: "manager",
        locale: "en",
        is_active: true,
        branch_id: otherBranchId,
      },
    });
    managerOnOtherBranchId = manager.id;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: tenantId,
        email: `cash-${randomUUID().slice(0, 8)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
        is_active: true,
        branch_id: branchId,
      },
    });
    cashierId = cashier.id;

    const supplier = await adminPrisma.supplier.create({
      data: {
        tenant_id: tenantId,
        code: "SUP-1",
        name_i18n: { en: "Sidamo Direct", ar: "سيدامو" },
        currency_code: "USD",
        lead_time_days: 18,
      },
    });
    supplierId = supplier.id;

    p1 = await makeProduct("Yirgacheffe", 1000n);
    p2 = await makeProduct("Kenya AA", 1500n);
    p3 = await makeProduct("House Blend", 800n);
    p4 = await makeProduct("Decaf", 900n);

    // p1: on-hand 8, sold 60/30d → velocity 2/day, days_of_cover 4 → at risk
    await setStock(p1, 8, null, null);
    await sell(p1, 60);
    // p2: on-hand 5, sold 30/30d → velocity 1/day, days_of_cover 5 → at risk
    await setStock(p2, 5, null, null);
    await sell(p2, 30);
    // p3: on-hand 100, no sales, no reorder point → healthy, excluded
    await setStock(p3, 100, null, null);
    // p4: on-hand 2, reorder_point 10 → at risk by threshold, no preferred supplier
    await setStock(p4, 2, 10, null);

    // Preferred supplier for p1 + p2 only.
    for (const pid of [p1, p2]) {
      await adminPrisma.supplierProduct.create({
        data: {
          tenant_id: tenantId,
          supplier_id: supplierId,
          product_id: pid,
          unit_cost_cents: 1100n,
          currency_code: "USD",
          is_preferred: true,
        },
      });
    }

    ownerToken = (await tokens.mintPair({ userId: ownerId, tenantId, role: "owner" })).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("cashier is forbidden (403)", async () => {
    const token = (await tokens.mintPair({ userId: cashierId, tenantId, role: "cashier" })).access_token;
    const res = await request(booted.http)
      .get(`/v1/reorder/suggestions?branch_id=${branchId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("owner: at-risk SKUs surface, healthy ones are excluded", async () => {
    const res = await request(booted.http)
      .get(`/v1/reorder/suggestions?branch_id=${branchId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branch_id).toBe(branchId);
    expect(res.body.horizon_days).toBe(7);
    // p1, p2 (velocity) + p4 (reorder point) = 3 at risk; p3 healthy excluded.
    expect(res.body.at_risk_count).toBe(3);

    const allProductIds = [
      ...res.body.groups.flatMap((g: { lines: { product_id: string }[] }) => g.lines.map((l) => l.product_id)),
      ...res.body.ungrouped.map((l: { product_id: string }) => l.product_id),
    ];
    expect(allProductIds).toContain(p1);
    expect(allProductIds).toContain(p2);
    expect(allProductIds).toContain(p4);
    expect(allProductIds).not.toContain(p3);
  });

  it("groups p1+p2 under their preferred supplier with a sensible suggested qty", async () => {
    const res = await request(booted.http)
      .get(`/v1/reorder/suggestions?branch_id=${branchId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.body.groups).toHaveLength(1);
    const group = res.body.groups[0];
    expect(group.supplier_id).toBe(supplierId);
    expect(group.lead_time_days).toBe(18);
    expect(group.lines).toHaveLength(2);

    const line1 = group.lines.find((l: { product_id: string }) => l.product_id === p1);
    expect(line1.qty_on_hand).toBe(8);
    expect(line1.days_of_cover).toBe(4); // 8 / (60/30)
    // suggested = ceil(velocity * (lead + horizon)) - qty = ceil(2 * 25) - 8 = 42
    expect(line1.suggested_qty).toBe(42);
    expect(line1.unit_cost_cents).toBe("1100");
  });

  it("a product with no preferred supplier lands in ungrouped", async () => {
    const res = await request(booted.http)
      .get(`/v1/reorder/suggestions?branch_id=${branchId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.body.ungrouped).toHaveLength(1);
    const u = res.body.ungrouped[0];
    expect(u.product_id).toBe(p4);
    // velocity 0 → suggested = reorder_point - qty = 10 - 2 = 8
    expect(u.suggested_qty).toBe(8);
    expect(u.days_of_cover).toBeNull();
  });

  it("a tighter horizon excludes the slower mover (p2)", async () => {
    const res = await request(booted.http)
      .get(`/v1/reorder/suggestions?branch_id=${branchId}&horizon_days=4`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const grouped = res.body.groups.flatMap((g: { lines: { product_id: string }[] }) => g.lines.map((l) => l.product_id));
    // p1 days_of_cover 4 ≤ 4 stays; p2 (5) drops out; p4 still in by reorder point.
    expect(grouped).toContain(p1);
    expect(grouped).not.toContain(p2);
  });

  it("a manager assigned to another branch is forbidden (403)", async () => {
    const token = (
      await tokens.mintPair({ userId: managerOnOtherBranchId, tenantId, role: "manager" })
    ).access_token;
    const res = await request(booted.http)
      .get(`/v1/reorder/suggestions?branch_id=${branchId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_branch");
  });

  it("RLS canary: tenant B cannot see tenant A's branch (404)", async () => {
    const b = await makeTenant({ slugPrefix: "reorder-other" });
    const token = (await tokens.mintPair({ userId: b.userId, tenantId: b.tenantId, role: "owner" })).access_token;
    const res = await request(booted.http)
      .get(`/v1/reorder/suggestions?branch_id=${branchId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("branch_not_found");
  });
});
