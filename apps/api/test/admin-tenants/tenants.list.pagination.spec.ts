import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import {
  isolateTenantUniverse,
  makeMultipleTenants,
  makePlatformUser,
} from "../helpers/admin-fixtures";

describe("GET /v1/admin/tenants — pagination", () => {
  let booted: BootedTestApp;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    await isolateTenantUniverse([]);
    // 60 tenants — enough to exercise multi-page paging without bloating the run.
    await makeMultipleTenants(
      Array.from({ length: 60 }, () => ({ status: "active" as const, planCode: "starter" })),
    );
    const a = await makePlatformUser({ emailPrefix: "tenants-page" });
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

  it("default page=1 limit=50 returns the first 50 of 60", async () => {
    const res = await listTenants("");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(60);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
  });

  it("page=2 limit=25 returns items[25..49] (still 25 items)", async () => {
    const res = await listTenants("?page=2&limit=25");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(60);
    expect(res.body.items).toHaveLength(25);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(25);
  });

  it("the trailing page returns fewer items than the limit", async () => {
    const res = await listTenants("?page=3&limit=25");
    expect(res.status).toBe(200);
    // 60 - 25 - 25 = 10
    expect(res.body.items).toHaveLength(10);
  });

  it("page=0 is rejected (page must be >= 1)", async () => {
    const res = await listTenants("?page=0");
    expect(res.status).toBe(400);
  });

  it("limit beyond the cap is rejected", async () => {
    const res = await listTenants("?limit=999");
    expect(res.status).toBe(400);
  });
});
