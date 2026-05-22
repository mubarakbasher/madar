import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makeTenant } from "../helpers/fixtures";
import { makePlatformUser } from "../helpers/admin-fixtures";

/**
 * Admin-side realm-canary — the reverse of apps/api/test/auth/realm-canary.spec.ts.
 * AdminAuthGuard / verifyAccess MUST reject anything that isn't a real
 * admin-realm token signed with JWT_ADMIN_SECRET.
 *
 * File name matches the `pnpm test:realm` filter (vitest run realm-canary).
 */
describe("realm-canary — AdminAuthGuard rejects out-of-realm tokens", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("rejects a real tenant-realm access token on /v1/admin/auth/me", async () => {
    const t = await makeTenant({ slugPrefix: "canary-tenant" });
    const tenantTokens = booted.app.get(TokenService);
    const pair = await tenantTokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });

    const res = await request(booted.http)
      .get("/v1/admin/auth/me")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_expired" });
  });

  it("rejects an mfa_pending token on /v1/admin/auth/me (access-only endpoint)", async () => {
    const a = await makePlatformUser({ emailPrefix: "canary-pending" });
    const adminTokens = booted.app.get(AdminTokenService);
    const pending = adminTokens.mintMfaPending({ platformUserId: a.platformUserId, email: a.email });

    const res = await request(booted.http)
      .get("/v1/admin/auth/me")
      .set("Authorization", `Bearer ${pending.token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_expired" });
  });

  it("rejects an admin-realm refresh token used as a bearer access on /v1/admin/auth/me", async () => {
    const a = await makePlatformUser({ emailPrefix: "canary-refresh" });
    const adminTokens = booted.app.get(AdminTokenService);
    const pair = await adminTokens.mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    const res = await request(booted.http)
      .get("/v1/admin/auth/me")
      .set("Authorization", `Bearer ${pair.refresh_token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_expired" });
  });

  it("a real admin access token rejected on /v1/auth/me (tenant endpoint)", async () => {
    // Symmetric assertion — the tenant guard must reject admin tokens. This
    // is also covered by apps/api/test/auth/realm-canary.spec.ts, asserted
    // here from the admin side for explicit coverage.
    const a = await makePlatformUser({ emailPrefix: "canary-cross" });
    const adminTokens = booted.app.get(AdminTokenService);
    const pair = await adminTokens.mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });

    const res = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_expired" });
  });
});
