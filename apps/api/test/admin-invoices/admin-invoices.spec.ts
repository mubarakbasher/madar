import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser, seedAllPlans } from "../helpers/admin-fixtures";
import { makeSubscriptionInvoice, makeTenant } from "../helpers/fixtures";

describe("GET /v1/admin/invoices", () => {
  let booted: BootedTestApp;
  let adminToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    await seedAllPlans();
    const admin = await makePlatformUser({ emailPrefix: "inv-admin", role: "owner" });
    const tokens = booted.app.get(AdminTokenService);
    const pair = await tokens.mintAccessPair({
      platformUserId: admin.platformUserId,
      email: admin.email,
      role: admin.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    adminToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns cross-tenant invoices with tenant + plan + days_overdue", async () => {
    const t1 = await makeTenant({ slugPrefix: "inv-tenant-a", status: "active" });
    const t2 = await makeTenant({ slugPrefix: "inv-tenant-b", status: "active" });
    await makeSubscriptionInvoice(t1.tenantId, t1.planId, { status: "awaiting_payment" });
    await makeSubscriptionInvoice(t2.tenantId, t2.planId, { status: "paid" });

    const res = await request(booted.http)
      .get("/v1/admin/invoices")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.items[0]).toHaveProperty("tenant");
    expect(res.body.items[0]).toHaveProperty("plan");
    expect(res.body.items[0]).toHaveProperty("days_overdue");
  });

  it("status=paid filters to paid only", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/invoices?status=paid")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const inv of res.body.items) expect(inv.status).toBe("paid");
  });

  it("search filters by tenant name (case-insensitive)", async () => {
    const t = await makeTenant({ slugPrefix: "uniq-inv-search", status: "active" });
    await makeSubscriptionInvoice(t.tenantId, t.planId, { status: "awaiting_payment" });
    const res = await request(booted.http)
      .get(`/v1/admin/invoices?search=${encodeURIComponent("uniq-inv-search")}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const inv of res.body.items) {
      expect(inv.tenant.slug).toContain("uniq-inv-search");
    }
  });

  it("401 without admin token", async () => {
    const res = await request(booted.http).get("/v1/admin/invoices");
    expect(res.status).toBe(401);
  });
});
