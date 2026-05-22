import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant } from "../helpers/fixtures";

/**
 * Admin realm canary for the dashboard endpoints.
 * File name matches the `pnpm test:realm` filter.
 */
describe("realm-canary — admin dashboard rejects tenant tokens", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("/v1/admin/dashboard/kpi rejects a real tenant-realm access token", async () => {
    const t = await makeTenant({ slugPrefix: "kpi-canary" });
    const tenantTokens = booted.app.get(TokenService);
    const pair = await tenantTokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/kpi")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_expired" });
  });

  it("/v1/admin/dashboard/activity rejects a tenant-realm access token", async () => {
    const t = await makeTenant({ slugPrefix: "activity-canary" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/activity")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(res.status).toBe(401);
  });
});
