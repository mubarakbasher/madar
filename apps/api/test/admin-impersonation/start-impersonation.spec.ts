import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makePlatformUser,
  readPlatformAudit,
  seedAllPlans,
  type PlatformUserFixture,
} from "../helpers/admin-fixtures";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("POST /v1/admin/tenants/:id/impersonate", () => {
  let booted: BootedTestApp;
  let admin: PlatformUserFixture;
  let supportAdmin: PlatformUserFixture;
  let financeAdmin: PlatformUserFixture;
  let adminAccess: string;
  let supportAccess: string;
  let financeAccess: string;
  let tenant: TenantWithCatalogFixture;

  beforeAll(async () => {
    booted = await bootTestApp();
    await seedAllPlans();
    admin = await makePlatformUser({ emailPrefix: "imper-owner", role: "owner" });
    supportAdmin = await makePlatformUser({ emailPrefix: "imper-support", role: "support" });
    financeAdmin = await makePlatformUser({ emailPrefix: "imper-finance", role: "finance" });
    const adminTokens = booted.app.get(AdminTokenService);
    const ownerPair = await adminTokens.mintAccessPair({
      platformUserId: admin.platformUserId,
      email: admin.email,
      role: admin.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    adminAccess = ownerPair.access_token;
    const supportPair = await adminTokens.mintAccessPair({
      platformUserId: supportAdmin.platformUserId,
      email: supportAdmin.email,
      role: supportAdmin.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    supportAccess = supportPair.access_token;
    const financePair = await adminTokens.mintAccessPair({
      platformUserId: financeAdmin.platformUserId,
      email: financeAdmin.email,
      role: financeAdmin.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    financeAccess = financePair.access_token;

    tenant = await makeTenantWithCatalog({ slugPrefix: "imper-target" });
  });
  afterAll(async () => {
    await booted.app.close();
  });

  /** Start impersonation and swap the one-time handoff code for the JWT. */
  async function startAndExchange(reason: string): Promise<string> {
    const startRes = await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${adminAccess}`)
      .send({ user_id: tenant.userId, reason });
    expect(startRes.status).toBe(201);
    const ex = await request(booted.http)
      .post("/v1/impersonation/exchange")
      .send({ code: startRes.body.handoff_code });
    expect(ex.status).toBe(200);
    return ex.body.access_token as string;
  }

  it("happy path (owner role): returns a single-use handoff code (never the JWT) + double-logs impersonation_started", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${adminAccess}`)
      .send({ user_id: tenant.userId, reason: "Investigating reported sync issue" });

    expect(res.status).toBe(201);
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.handoff_code).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.target_tenant.id).toBe(tenant.tenantId);
    expect(res.body.target_user.id).toBe(tenant.userId);
    expect(res.body.jti).toEqual(expect.any(String));

    // Exchange works exactly once.
    const ex1 = await request(booted.http)
      .post("/v1/impersonation/exchange")
      .send({ code: res.body.handoff_code });
    expect(ex1.status).toBe(200);
    expect(ex1.body.access_token).toEqual(expect.any(String));
    expect(ex1.body.impersonator_email).toBe(admin.email);
    const ex2 = await request(booted.http)
      .post("/v1/impersonation/exchange")
      .send({ code: res.body.handoff_code });
    expect(ex2.status).toBe(401);
    expect(ex2.body.code).toBe("handoff_code_invalid");

    const audit = await readPlatformAudit(admin.platformUserId, "impersonation_started");
    expect(audit.some((a) => a.target_tenant_id === tenant.tenantId)).toBe(true);

    // CLAUDE.md double-logging: the tenant's own audit_log carries the start.
    const tenantAudit = await adminPrisma.auditLog.findMany({
      where: { tenant_id: tenant.tenantId, action: "impersonation_started" },
    });
    expect(tenantAudit.length).toBeGreaterThan(0);
    expect(tenantAudit[0]!.impersonator_id).toBe(admin.platformUserId);
  });

  it("support role can also start impersonation", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${supportAccess}`)
      .send({ user_id: tenant.userId, reason: "Customer support escalation" });
    expect(res.status).toBe(201);
  });

  it("finance role gets 403 impersonation_forbidden_role", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${financeAccess}`)
      .send({ user_id: tenant.userId, reason: "trying finance" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("impersonation_forbidden_role");
  });

  it("unknown tenant returns 404 tenant_not_found", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/tenants/${randomUUID()}/impersonate`)
      .set("Authorization", `Bearer ${adminAccess}`)
      .send({ user_id: tenant.userId, reason: "ghost" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("tenant_not_found");
  });

  it("user not in tenant returns 404 target_user_not_found", async () => {
    const otherTenant = await makeTenantWithCatalog({ slugPrefix: "imper-other" });
    const res = await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${adminAccess}`)
      .send({ user_id: otherTenant.userId, reason: "wrong tenant" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("target_user_not_found");
  });

  it("rejects missing reason with 400", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/tenants/${tenant.tenantId}/impersonate`)
      .set("Authorization", `Bearer ${adminAccess}`)
      .send({ user_id: tenant.userId, reason: "" });
    expect(res.status).toBe(400);
  });

  it("minted impersonation token validates against TenantAuthGuard with impersonator claim", async () => {
    const imperToken = await startAndExchange("validate token shape");

    const me = await request(booted.http)
      .get("/v1/impersonation/me")
      .set("Authorization", `Bearer ${imperToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      active: true,
      impersonator_id: admin.platformUserId,
      impersonator_email: admin.email,
    });
  });

  it("destructive op (product delete) under impersonation is blocked 403", async () => {
    const imperToken = await startAndExchange("test destructive block");

    const del = await request(booted.http)
      .delete(`/v1/products/${tenant.products[0]!.id}`)
      .set("Authorization", `Bearer ${imperToken}`);
    expect(del.status).toBe(403);
    expect(del.body.code).toBe("forbidden_during_impersonation");
  });

  it("non-destructive sale under impersonation is allowed and audit_log carries impersonator_id", async () => {
    const imperToken = await startAndExchange("test double-log");

    const productForSale = tenant.products[1]!;
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
        lines: [{ product_id: productForSale.id, qty: 1, line_discount_cents: 0, note: null }],
        cash_tendered_cents: Number(productForSale.price_cents),
      });
    expect(sale.status).toBe(201);

    const auditRows = await adminPrisma.auditLog.findMany({
      where: { tenant_id: tenant.tenantId, action: "sale_completed", entity_id: sale.body.id },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.impersonator_id).toBe(admin.platformUserId);
  });

  it("exit revokes the jti — subsequent requests with the token return 401 impersonation_revoked", async () => {
    const imperToken = await startAndExchange("test exit");

    const exit = await request(booted.http)
      .post("/v1/impersonation/exit")
      .set("Authorization", `Bearer ${imperToken}`);
    expect(exit.status).toBe(201);

    const me = await request(booted.http)
      .get("/v1/impersonation/me")
      .set("Authorization", `Bearer ${imperToken}`);
    expect(me.status).toBe(401);
    expect(me.body.code).toBe("impersonation_revoked");

    const endedAudit = await readPlatformAudit(admin.platformUserId, "impersonation_ended");
    expect(endedAudit.length).toBeGreaterThan(0);
  });

  it("/v1/impersonation/exit with a non-impersonation token returns 400", async () => {
    const tokens = booted.app.get(TokenService);
    const normal = await tokens.mintPair({
      userId: tenant.userId,
      tenantId: tenant.tenantId,
      role: "owner",
    });
    const exit = await request(booted.http)
      .post("/v1/impersonation/exit")
      .set("Authorization", `Bearer ${normal.access_token}`);
    expect(exit.status).toBe(400);
    expect(exit.body.code).toBe("not_impersonating");
  });
});
