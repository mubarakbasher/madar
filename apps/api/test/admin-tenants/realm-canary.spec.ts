import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant } from "../helpers/fixtures";

describe("realm-canary — admin tenants list rejects tenant tokens", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("rejects a real tenant-realm access token on /v1/admin/tenants", async () => {
    const t = await makeTenant({ slugPrefix: "tenants-canary" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const res = await request(booted.http)
      .get("/v1/admin/tenants")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_expired" });
  });

  it("rejects a missing Authorization header on /v1/admin/tenants", async () => {
    const res = await request(booted.http).get("/v1/admin/tenants");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_missing" });
  });
});
