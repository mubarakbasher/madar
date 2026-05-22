import { describe, expect, it } from "vitest";
import { adminPrisma, basePrisma, tenantScoped } from "../src/index";
import { TENANT_A_ID, TENANT_B_ID } from "./setup";

/**
 * Cross-tenant isolation suite. For every tenant-scoped model:
 *   1. tenantScoped(A) only sees A's rows
 *   2. adminPrisma sees both A's and B's rows
 *   3. A raw basePrisma client (no session vars) sees 0 rows ← canary that
 *      FORCE ROW LEVEL SECURITY is in effect. Without FORCE, the table owner
 *      role would bypass RLS and the entire safety net would silently fail.
 *
 * Additionally:
 *   4. tenantScoped(A) cannot insert a row with tenant_id = B (WITH CHECK
 *      clause rejects). Tested on a couple of representative models.
 */

// Names match Prisma model accessors on the client (camelCase singular).
const TENANT_SCOPED_MODELS = [
  "user",
  "branch",
  "category",
  "product",
  "customer",
  "tenantBankAccount",
  "branchStock",
  "stockMovement",
  "sale",
  "saleLine",
  "paymentProof",
  "subscriptionInvoice",
  "auditLog",
  // Phase 2.3 — suppliers / purchase orders / returns
  "supplier",
  "supplierProduct",
  "purchaseOrder",
  "purchaseOrderLine",
  "supplierReturn",
  "supplierReturnLine",
  "supplierDocument",
  "taxClass",
  // Phase 1.10d — server-side held sales
  "heldSale",
  "heldSaleLine",
  // Phase 2.3 — offline POS conflict surfacing
  "syncConflict",
  // Phase 3 — scheduled email reports
  "scheduledReport",
] as const;

type ModelName = (typeof TENANT_SCOPED_MODELS)[number];

describe.each(TENANT_SCOPED_MODELS)("RLS — %s", (model) => {
  it("tenantScoped(A) cannot see tenant B's rows", async () => {
    const client = tenantScoped(TENANT_A_ID) as any;
    const rows: Array<{ tenant_id: string }> = await client[model].findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true);
    expect(rows.find((r) => r.tenant_id === TENANT_B_ID)).toBeUndefined();
  });

  it("adminPrisma sees both tenants' rows", async () => {
    const rows: Array<{ tenant_id: string }> = await (adminPrisma as any)[model].findMany();
    expect(rows.some((r) => r.tenant_id === TENANT_A_ID)).toBe(true);
    expect(rows.some((r) => r.tenant_id === TENANT_B_ID)).toBe(true);
  });

  it("basePrisma with no session vars sees 0 rows (FORCE RLS canary)", async () => {
    const rows: unknown[] = await (basePrisma as any)[model].findMany();
    expect(rows).toHaveLength(0);
  });
});

describe("WITH CHECK enforcement", () => {
  it("tenantScoped(A) cannot insert a product into tenant B", async () => {
    const client = tenantScoped(TENANT_A_ID);
    await expect(
      client.product.create({
        data: {
          tenant_id: TENANT_B_ID,
          sku: "INTRUDER",
          name_i18n: { en: "Intruder", ar: "" },
          price_cents: 1n,
          cost_cents: 1n,
          currency_code: "EGP",
        },
      }),
    ).rejects.toThrow();
  });

  it("tenantScoped(A) cannot insert audit_log into tenant B", async () => {
    const client = tenantScoped(TENANT_A_ID);
    await expect(
      client.auditLog.create({
        data: {
          tenant_id: TENANT_B_ID,
          action: "intrude",
          entity: "x",
          entity_id: TENANT_B_ID,
        },
      }),
    ).rejects.toThrow();
  });

  it("tenantScoped(A) cannot insert a supplier into tenant B", async () => {
    const client = tenantScoped(TENANT_A_ID);
    await expect(
      client.supplier.create({
        data: {
          tenant_id: TENANT_B_ID,
          code: "INTRUDER-SUP",
          name_i18n: { en: "Intruder", ar: "" },
          currency_code: "USD",
        },
      }),
    ).rejects.toThrow();
  });

  it("tenantScoped(A) cannot insert a held_sale into tenant B", async () => {
    const client = tenantScoped(TENANT_A_ID);
    const brB = await adminPrisma.branch.findFirst({ where: { tenant_id: TENANT_B_ID } });
    const userB = await adminPrisma.user.findFirst({ where: { tenant_id: TENANT_B_ID } });
    expect(brB).toBeTruthy();
    expect(userB).toBeTruthy();
    await expect(
      client.heldSale.create({
        data: {
          tenant_id: TENANT_B_ID,
          branch_id: brB!.id,
          cashier_id: userB!.id,
          name: "Intruder",
          currency_code: "EGP",
        },
      }),
    ).rejects.toThrow();
  });

  it("tenantScoped(A) cannot insert a purchase_order into tenant B", async () => {
    const client = tenantScoped(TENANT_A_ID);
    // Need a real supplier_id + branch_id under tenant B. Look them up via
    // adminPrisma — RLS would hide them from a tenant-scoped client. WITH
    // CHECK still rejects on insert because tenant_id mismatches the session
    // var, regardless of whether the FK targets exist.
    const supB = await adminPrisma.supplier.findFirst({
      where: { tenant_id: TENANT_B_ID },
    });
    const brB = await adminPrisma.branch.findFirst({
      where: { tenant_id: TENANT_B_ID },
    });
    expect(supB).toBeTruthy();
    expect(brB).toBeTruthy();
    await expect(
      client.purchaseOrder.create({
        data: {
          tenant_id: TENANT_B_ID,
          code: "PO-INTRUDER",
          supplier_id: supB!.id,
          branch_id: brB!.id,
          currency_code: "USD",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Append-only audit logs", () => {
  it("UPDATE on audit_log is blocked at the DB level", async () => {
    const row = await adminPrisma.auditLog.findFirst({ where: { tenant_id: TENANT_A_ID } });
    expect(row).toBeTruthy();
    await expect(
      adminPrisma.auditLog.update({
        where: { id: row!.id },
        data: { action: "tampered" },
      }),
    ).rejects.toThrow();
  });

  it("DELETE on audit_log is blocked at the DB level", async () => {
    const row = await adminPrisma.auditLog.findFirst({ where: { tenant_id: TENANT_A_ID } });
    expect(row).toBeTruthy();
    await expect(
      adminPrisma.auditLog.delete({ where: { id: row!.id } }),
    ).rejects.toThrow();
  });
});
