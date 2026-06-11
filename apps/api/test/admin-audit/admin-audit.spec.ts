import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser, seedAllPlans } from "../helpers/admin-fixtures";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("Admin audit endpoints", () => {
  let booted: BootedTestApp;
  let adminToken: string;
  let adminId: string;
  let tenant: TenantWithCatalogFixture;

  beforeAll(async () => {
    booted = await bootTestApp();
    await seedAllPlans();
    const admin = await makePlatformUser({ emailPrefix: "audit-admin", role: "owner" });
    adminId = admin.platformUserId;
    const tokens = booted.app.get(AdminTokenService);
    const pair = await tokens.mintAccessPair({
      platformUserId: admin.platformUserId,
      email: admin.email,
      role: admin.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    adminToken = pair.access_token;

    tenant = await makeTenantWithCatalog({ slugPrefix: "audit-target" });

    // Trigger a real impersonation_started so login-as audit has data.
    await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ user_id: tenant.userId, reason: "audit spec setup" });
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("GET /v1/admin/platform-audit returns recent events", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/platform-audit")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0]).toHaveProperty("platform_user");
    expect(res.body.items[0]).toHaveProperty("action");
  });

  it("GET /v1/admin/platform-audit?action_prefix=impersonation filters correctly", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/platform-audit?action_prefix=impersonation")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const r of res.body.items) {
      expect(r.action.startsWith("impersonation")).toBe(true);
    }
  });

  it("GET /v1/admin/login-as-audit lists started sessions with target_tenant + actions_count", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/login-as-audit")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const session = res.body.items.find((s: { target_tenant: { id: string } }) => s.target_tenant.id === tenant.tenantId);
    expect(session).toBeDefined();
    expect(session.platform_user.id).toBe(adminId);
    expect(typeof session.actions_count).toBe("number");
  });

  it("GET /v1/admin/login-as-audit?platform_user_id filters", async () => {
    const res = await request(booted.http)
      .get(`/v1/admin/login-as-audit?platform_user_id=${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const s of res.body.items) expect(s.platform_user.id).toBe(adminId);
  });

  it("login-as session shows action count after impersonation mutations", async () => {
    // Start another session and run a real audited action under it.
    const start = await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ user_id: tenant.userId, reason: "actions count check" });
    expect(start.status).toBe(201);
    // Start returns a single-use handoff code, not the JWT — exchange it.
    const exchange = await request(booted.http)
      .post("/v1/impersonation/exchange")
      .send({ code: start.body.handoff_code });
    expect(exchange.status).toBe(200);
    const imperToken: string = exchange.body.access_token;

    // Run a non-destructive sale under the impersonation token.
    const sale = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${imperToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: tenant.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [
          { product_id: tenant.products[0]!.id, qty: 1, line_discount_cents: 0, note: null },
        ],
        cash_tendered_cents: Number(tenant.products[0]!.price_cents),
      });
    expect(sale.status).toBe(201);

    const audit = await adminPrisma.auditLog.count({
      where: { tenant_id: tenant.tenantId, impersonator_id: adminId, action: "sale_completed" },
    });
    expect(audit).toBeGreaterThan(0);
  });

  it("401 without admin token", async () => {
    const res = await request(booted.http).get("/v1/admin/platform-audit");
    expect(res.status).toBe(401);
  });
});
