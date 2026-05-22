import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser, seedAllPlans } from "../helpers/admin-fixtures";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("GET /v1/admin/tenants/:id", () => {
  let booted: BootedTestApp;
  let adminAccess: string;
  let tenant: TenantWithCatalogFixture;

  beforeAll(async () => {
    booted = await bootTestApp();
    await seedAllPlans();
    const admin = await makePlatformUser({ emailPrefix: "detail-admin", role: "owner" });
    const tokens = booted.app.get(AdminTokenService);
    const pair = await tokens.mintAccessPair({
      platformUserId: admin.platformUserId,
      email: admin.email,
      role: admin.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    adminAccess = pair.access_token;
    tenant = await makeTenantWithCatalog({ slugPrefix: "detail-target" });
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy: returns full tenant shape with plan, kpis, branches, users", async () => {
    const res = await request(booted.http)
      .get(`/v1/admin/tenants/${tenant.tenantId}`)
      .set("Authorization", `Bearer ${adminAccess}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tenant.tenantId);
    expect(res.body.plan.code).toBeTruthy();
    expect(res.body.kpis).toHaveProperty("branch_count");
    expect(res.body.kpis.branch_count).toBe(1);
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);
  });

  it("unknown tenant returns 404", async () => {
    const res = await request(booted.http)
      .get(`/v1/admin/tenants/${randomUUID()}`)
      .set("Authorization", `Bearer ${adminAccess}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("tenant_not_found");
  });

  it("401 without admin token", async () => {
    const res = await request(booted.http).get(`/v1/admin/tenants/${tenant.tenantId}`);
    expect(res.status).toBe(401);
  });
});
