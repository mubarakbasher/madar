import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

describe("Held sales (/v1/held-sales)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let ownerUserId: string;
  let cashierAId: string;
  let cashierAToken: string;
  let cashierBId: string;
  let cashierBToken: string;
  let otherTenant: TenantWithCatalogFixture;
  let otherOwnerToken: string;

  async function putHold(opts: {
    token: string;
    branchId?: string;
    productId: string;
    name?: string;
    customerId?: string | null;
    unitPriceCents?: string;
  }): Promise<{ status: number; body: { id?: string; [k: string]: unknown } }> {
    const res = await request(booted.http)
      .post("/v1/held-sales")
      .set("Authorization", `Bearer ${opts.token}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: opts.branchId ?? t.branchId,
        name: opts.name ?? "Table 4",
        note: "oat milk",
        customer_id: opts.customerId ?? null,
        currency_code: "USD",
        subtotal_cents: "3500",
        discount_cents: "0",
        tax_cents: "0",
        total_cents: "3500",
        lines: [
          {
            product_id: opts.productId,
            qty: 1,
            unit_price_cents: opts.unitPriceCents ?? "3500",
            discount_cents: "0",
            note: null,
          },
        ],
      });
    return { status: res.status, body: res.body };
  }

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "held" });
    ownerUserId = t.userId;
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const cA = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashA-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier A",
        role: "cashier",
        branch_id: t.branchId,
        locale: "en",
      },
    });
    cashierAId = cA.id;
    cashierAToken = (
      await tokens.mintPair({ userId: cA.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    const cB = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashB-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier B",
        role: "cashier",
        branch_id: t.branchId,
        locale: "en",
      },
    });
    cashierBId = cB.id;
    cashierBToken = (
      await tokens.mintPair({ userId: cB.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    // Second tenant for RLS canary.
    otherTenant = await makeTenantWithCatalog({ slugPrefix: "held-rls" });
    otherOwnerToken = (
      await tokens.mintPair({
        userId: otherTenant.userId,
        tenantId: otherTenant.tenantId,
        role: "owner",
      })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("cashier puts a hold, then lists with mine_only=true — sees it", async () => {
    const product = t.products[0]!;
    const created = await putHold({
      token: cashierAToken,
      productId: product.id,
      name: "A's ticket",
    });
    expect(created.status).toBe(201);
    expect(created.body.id).toEqual(expect.any(String));
    expect(created.body.cashier_id).toBe(cashierAId);
    expect(created.body.total_cents).toBe("3500");
    expect((created.body.lines as unknown[]).length).toBe(1);

    const audit = await readAuditLog(t.tenantId, "held_sale_created");
    expect(audit.length).toBeGreaterThan(0);

    const list = await request(booted.http)
      .get(`/v1/held-sales?branch_id=${t.branchId}&mine_only=true`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).toContain(created.body.id as string);
  });

  it("another cashier in same branch with mine_only=true does NOT see it", async () => {
    const product = t.products[1]!;
    const created = await putHold({
      token: cashierAToken,
      productId: product.id,
      name: "A only",
    });
    expect(created.status).toBe(201);

    const list = await request(booted.http)
      .get(`/v1/held-sales?branch_id=${t.branchId}&mine_only=true`)
      .set("Authorization", `Bearer ${cashierBToken}`);
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(created.body.id as string);

    // Even mine_only=false is forced for cashiers — still blind.
    const list2 = await request(booted.http)
      .get(`/v1/held-sales?branch_id=${t.branchId}&mine_only=false`)
      .set("Authorization", `Bearer ${cashierBToken}`);
    expect(list2.status).toBe(200);
    const ids2 = (list2.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids2).not.toContain(created.body.id as string);
  });

  it("owner with mine_only=false sees all branch tickets", async () => {
    const product = t.products[2]!;
    const cA = await putHold({
      token: cashierAToken,
      productId: product.id,
      name: "Cashier A ticket",
    });
    const cB = await putHold({
      token: cashierBToken,
      productId: product.id,
      name: "Cashier B ticket",
    });
    expect(cA.status).toBe(201);
    expect(cB.status).toBe(201);

    const list = await request(booted.http)
      .get(`/v1/held-sales?branch_id=${t.branchId}&mine_only=false`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).toContain(cA.body.id as string);
    expect(ids).toContain(cB.body.id as string);
  });

  it("RLS canary: tenant B can't see tenant A's holds", async () => {
    const product = t.products[0]!;
    const created = await putHold({
      token: ownerToken,
      productId: product.id,
      name: "Tenant A secret",
    });
    expect(created.status).toBe(201);

    const list = await request(booted.http)
      .get(`/v1/held-sales?branch_id=${t.branchId}&mine_only=false`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(created.body.id as string);

    // Cross-tenant resume = 404 (RLS hides the row entirely).
    const resume = await request(booted.http)
      .post(`/v1/held-sales/${created.body.id}/resume`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(resume.status).toBe(404);
  });

  it("resume returns payload + sets resumed_at + emits audit", async () => {
    const product = t.products[0]!;
    const created = await putHold({
      token: cashierAToken,
      productId: product.id,
      name: "Resume me",
    });
    expect(created.status).toBe(201);
    const heldId = created.body.id as string;

    const before = await adminPrisma.heldSale.findUnique({ where: { id: heldId } });
    expect(before?.resumed_at).toBeNull();

    const resume = await request(booted.http)
      .post(`/v1/held-sales/${heldId}/resume`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(resume.status).toBe(200);
    expect(resume.body.id).toBe(heldId);
    expect((resume.body.lines as unknown[]).length).toBe(1);
    expect(resume.body.resumed_at).toBeTruthy();

    const after = await adminPrisma.heldSale.findUnique({ where: { id: heldId } });
    expect(after?.resumed_at).not.toBeNull();

    const audit = await readAuditLog(t.tenantId, "held_sale_resumed");
    expect(audit.length).toBeGreaterThan(0);

    // Subsequent list (mine_only=true) no longer surfaces the resumed row.
    const list = await request(booted.http)
      .get(`/v1/held-sales?branch_id=${t.branchId}&mine_only=true`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(heldId);
  });

  it("resume is idempotent: second resume returns same payload, doesn't move resumed_at", async () => {
    const product = t.products[1]!;
    const created = await putHold({
      token: cashierAToken,
      productId: product.id,
      name: "Idem resume",
    });
    expect(created.status).toBe(201);
    const heldId = created.body.id as string;

    const r1 = await request(booted.http)
      .post(`/v1/held-sales/${heldId}/resume`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(r1.status).toBe(200);
    const firstResumedAt = r1.body.resumed_at as string;
    expect(firstResumedAt).toBeTruthy();

    const auditAfterFirst = await readAuditLog(t.tenantId, "held_sale_resumed");
    const firstAuditCount = auditAfterFirst.length;

    const r2 = await request(booted.http)
      .post(`/v1/held-sales/${heldId}/resume`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(heldId);
    expect(r2.body.resumed_at).toBe(firstResumedAt);
    expect((r2.body.lines as unknown[]).length).toBe(1);

    // No new audit row.
    const auditAfterSecond = await readAuditLog(t.tenantId, "held_sale_resumed");
    expect(auditAfterSecond.length).toBe(firstAuditCount);
  });

  it("DELETE sets discarded_at and subsequent list excludes it", async () => {
    const product = t.products[2]!;
    const created = await putHold({
      token: cashierAToken,
      productId: product.id,
      name: "Discard me",
    });
    expect(created.status).toBe(201);
    const heldId = created.body.id as string;

    const del = await request(booted.http)
      .delete(`/v1/held-sales/${heldId}`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(del.status).toBe(200);
    expect(del.body.discarded_at).toBeTruthy();

    const list = await request(booted.http)
      .get(`/v1/held-sales?branch_id=${t.branchId}&mine_only=true`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(heldId);

    const audit = await readAuditLog(t.tenantId, "held_sale_discarded");
    expect(audit.length).toBeGreaterThan(0);

    // Second delete is idempotent.
    const del2 = await request(booted.http)
      .delete(`/v1/held-sales/${heldId}`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(del2.status).toBe(200);
  });

  it("cashier B cannot resume or discard cashier A's hold (403)", async () => {
    const product = t.products[0]!;
    const created = await putHold({
      token: cashierAToken,
      productId: product.id,
      name: "Owned by A",
    });
    expect(created.status).toBe(201);
    const heldId = created.body.id as string;

    const resume = await request(booted.http)
      .post(`/v1/held-sales/${heldId}/resume`)
      .set("Authorization", `Bearer ${cashierBToken}`);
    expect(resume.status).toBe(403);
    expect(resume.body.code).toBe("forbidden_not_owner");

    const del = await request(booted.http)
      .delete(`/v1/held-sales/${heldId}`)
      .set("Authorization", `Bearer ${cashierBToken}`);
    expect(del.status).toBe(403);

    // Owner can override.
    const ownerResume = await request(booted.http)
      .post(`/v1/held-sales/${heldId}/resume`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerResume.status).toBe(200);

    // Avoid lingering rows from previous tests by referencing the same userId.
    expect(ownerUserId).toEqual(t.userId);
  });
});
