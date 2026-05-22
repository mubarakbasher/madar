import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenant,
  makeTenantWithCatalog,
  type TenantFixture,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

describe("Sync conflicts (/v1/sync-conflicts)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let auditorToken: string;
  let otherTenant: TenantFixture;
  let otherOwnerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "sync-conf" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const manager = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `mgr-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Manager",
        role: "manager",
        locale: "en",
      },
    });
    managerToken = (
      await tokens.mintPair({ userId: manager.id, tenantId: t.tenantId, role: "manager" })
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

    const auditor = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `aud-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Auditor",
        role: "auditor",
        locale: "en",
      },
    });
    auditorToken = (
      await tokens.mintPair({ userId: auditor.id, tenantId: t.tenantId, role: "auditor" })
    ).access_token;

    otherTenant = await makeTenant({ slugPrefix: "sync-rls" });
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

  it("GET RBAC: cashier 403, owner/manager/auditor 200, anonymous 401", async () => {
    const ownerRes = await request(booted.http)
      .get("/v1/sync-conflicts")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerRes.status).toBe(200);

    const managerRes = await request(booted.http)
      .get("/v1/sync-conflicts")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(managerRes.status).toBe(200);

    const auditorRes = await request(booted.http)
      .get("/v1/sync-conflicts")
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(auditorRes.status).toBe(200);

    const cashierRes = await request(booted.http)
      .get("/v1/sync-conflicts")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(cashierRes.status).toBe(403);
    expect(cashierRes.body.code).toBe("forbidden_role");

    const anonRes = await request(booted.http).get("/v1/sync-conflicts");
    expect(anonRes.status).toBe(401);
  });

  it("negative-stock sale surfaces a sync_conflict row with details", async () => {
    // Sell more than starting_qty for the first product (qty 20 starting; sell 25).
    const product = t.products[0]!;
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: t.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        offline_completed: true,
        lines: [{ product_id: product.id, qty: 25, line_discount_cents: 0, note: null }],
        cash_tendered_cents: 200_000,
      });
    expect(res.status).toBe(201);
    expect(res.body.has_negative_stock).toBe(true);
    expect(res.body.offline_completed).toBe(true);

    const list = await request(booted.http)
      .get("/v1/sync-conflicts?status=open")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(list.status).toBe(200);
    const conflictForThisSale = list.body.items.find(
      (c: { reference_id: string }) => c.reference_id === res.body.id,
    );
    expect(conflictForThisSale).toBeDefined();
    expect(conflictForThisSale.conflict_kind).toBe("negative_stock");
    expect(conflictForThisSale.details.product_id).toBe(product.id);
    expect(conflictForThisSale.details.qty_on_hand_after).toBeLessThan(0);
    expect(conflictForThisSale.details.offline_completed).toBe(true);
    expect(conflictForThisSale.resolution_status).toBe("open");
  });

  it("resolve flow: manager resolves; second resolve returns 409 not_resolvable; audit row written", async () => {
    // Create a conflict via direct insert.
    const conflict = await adminPrisma.syncConflict.create({
      data: {
        tenant_id: t.tenantId,
        conflict_kind: "negative_stock",
        reference_table: "sales",
        reference_id: randomUUID(),
        details: { product_id: t.products[0]!.id, qty_on_hand_after: -2 },
        occurred_at: new Date(),
      },
    });

    const res1 = await request(booted.http)
      .post(`/v1/sync-conflicts/${conflict.id}/resolve`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ resolution_status: "resolved", review_notes: "Counted; adjustment created." });
    expect(res1.status).toBe(200);
    expect(res1.body.resolution_status).toBe("resolved");
    expect(res1.body.reviewed_by_name).toBe("Manager");
    expect(res1.body.review_notes).toBe("Counted; adjustment created.");

    const res2 = await request(booted.http)
      .post(`/v1/sync-conflicts/${conflict.id}/resolve`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ resolution_status: "resolved" });
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe("not_resolvable");

    const auditRows = await adminPrisma.auditLog.findMany({
      where: { tenant_id: t.tenantId, action: "sync_conflict_resolved", entity_id: conflict.id },
    });
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0]!.after).toMatchObject({ resolution_status: "resolved" });
  });

  it("resolve RBAC: cashier + auditor 403; manager + owner 200", async () => {
    const conflict = await adminPrisma.syncConflict.create({
      data: {
        tenant_id: t.tenantId,
        conflict_kind: "negative_stock",
        reference_table: "sales",
        reference_id: randomUUID(),
        details: {},
        occurred_at: new Date(),
      },
    });

    const cashierRes = await request(booted.http)
      .post(`/v1/sync-conflicts/${conflict.id}/resolve`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ resolution_status: "ignored" });
    expect(cashierRes.status).toBe(403);

    const auditorRes = await request(booted.http)
      .post(`/v1/sync-conflicts/${conflict.id}/resolve`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ resolution_status: "ignored" });
    expect(auditorRes.status).toBe(403);

    const ownerRes = await request(booted.http)
      .post(`/v1/sync-conflicts/${conflict.id}/resolve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ resolution_status: "acknowledged" });
    expect(ownerRes.status).toBe(200);
  });

  it("RLS canary: tenant B cannot see tenant A's conflicts (empty list + 404 on resolve)", async () => {
    const conflict = await adminPrisma.syncConflict.create({
      data: {
        tenant_id: t.tenantId,
        conflict_kind: "negative_stock",
        reference_table: "sales",
        reference_id: randomUUID(),
        details: {},
        occurred_at: new Date(),
      },
    });

    const list = await request(booted.http)
      .get("/v1/sync-conflicts")
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.find((c: { id: string }) => c.id === conflict.id)).toBeUndefined();

    const resolve = await request(booted.http)
      .post(`/v1/sync-conflicts/${conflict.id}/resolve`)
      .set("Authorization", `Bearer ${otherOwnerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ resolution_status: "resolved" });
    expect(resolve.status).toBe(404);
  });

  it("summary returns counts grouped by status", async () => {
    const summary = await request(booted.http)
      .get("/v1/sync-conflicts/summary")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual(
      expect.objectContaining({
        open: expect.any(Number),
        acknowledged: expect.any(Number),
        resolved: expect.any(Number),
        ignored: expect.any(Number),
        total: expect.any(Number),
      }),
    );
    expect(summary.body.total).toBeGreaterThan(0);
  });
});
