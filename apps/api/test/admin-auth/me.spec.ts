import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser } from "../helpers/admin-fixtures";

describe("GET /v1/admin/auth/me", () => {
  let booted: BootedTestApp;
  let tokens: AdminTokenService;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(AdminTokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("401 admin_access_missing when no Authorization header", async () => {
    const res = await request(booted.http).get("/v1/admin/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_missing" });
  });

  it("401 admin_access_expired for a malformed Bearer", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/auth/me")
      .set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_expired" });
  });

  it("200 with platform_user for a valid admin access token; no token fields echoed", async () => {
    const a = await makePlatformUser({ emailPrefix: "me-admin", role: "finance" });
    const pair = await tokens.mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });

    const res = await request(booted.http)
      .get("/v1/admin/auth/me")
      .set("Authorization", `Bearer ${pair.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.platform_user).toMatchObject({
      id: a.platformUserId,
      email: a.email,
      role: "finance",
      mfa_enabled: true,
    });
    expect(res.body).not.toHaveProperty("access_token");
    expect(res.body).not.toHaveProperty("refresh_token");
    expect(res.body.platform_user).not.toHaveProperty("password_hash");
    expect(res.body.platform_user).not.toHaveProperty("mfa_secret");
  });
});
