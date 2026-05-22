import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import {
  isolateTenantUniverse,
  makeMultipleTenants,
  makePlatformUser,
} from "../helpers/admin-fixtures";

describe("GET /v1/admin/tenants — filters", () => {
  let booted: BootedTestApp;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    await isolateTenantUniverse([]);
    await makeMultipleTenants([
      { status: "active", planCode: "growth", country: "EG" },
      { status: "active", planCode: "growth", country: "SA" },
      { status: "trialing", planCode: "starter", country: "EG" },
      { status: "suspended", planCode: "business", country: "US" },
      { status: "cancelled", planCode: "starter", country: "AE" },
    ]);
    // Force a deterministic name for search testing.
    const all = await adminPrisma.tenant.findMany();
    await adminPrisma.tenant.update({ where: { id: all[0]!.id }, data: { name: "Bayt Coffee", slug: "bayt-coffee" } });

    const a = await makePlatformUser({ emailPrefix: "tenants-filter" });
    const pair = await booted.app.get(AdminTokenService).mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    accessToken = pair.access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  function listTenants(qs: string) {
    return request(booted.http)
      .get(`/v1/admin/tenants${qs}`)
      .set("Authorization", `Bearer ${accessToken}`);
  }

  it("status=active returns only active tenants", async () => {
    const res = await listTenants("?status=active");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((i: { status: string }) => i.status === "active")).toBe(true);
  });

  it("status=trialing returns only trialing tenants", async () => {
    const res = await listTenants("?status=trialing");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("country_code=EG narrows to Egyptian tenants only (case-insensitive input)", async () => {
    const res = await listTenants("?country_code=eg");
    expect(res.status).toBe(200);
    expect(res.body.items.every((i: { country_code: string }) => i.country_code === "EG")).toBe(true);
    expect(res.body.total).toBe(2);
  });

  it("plan_code=growth narrows to growth-plan tenants", async () => {
    const res = await listTenants("?plan_code=growth");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((i: { plan: { code: string } }) => i.plan.code === "growth")).toBe(true);
  });

  it("search matches by name (case-insensitive)", async () => {
    const res = await listTenants("?search=bayt");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toBe("Bayt Coffee");
  });

  it("search matches by slug as well", async () => {
    const res = await listTenants("?search=BAYT-COF");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("combining filters narrows the intersection (status + country)", async () => {
    const res = await listTenants("?status=active&country_code=EG");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].status).toBe("active");
    expect(res.body.items[0].country_code).toBe("EG");
  });

  it("invalid status returns 400 from zod", async () => {
    const res = await listTenants("?status=nope");
    expect(res.status).toBe(400);
  });
});
