import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { mintAdminRealmToken, mintRefreshAsAccess } from "../helpers/admin-jwt";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser } from "../helpers/admin-fixtures";

/**
 * Realm-canary spec — file name matches `pnpm test:realm` filter
 * (vitest run realm-canary). This is the load-bearing guardrail for the
 * tenant/admin auth-realm split per CLAUDE.md. Task 1.6 (admin auth) will
 * extend this pattern.
 */
describe("realm-canary — TenantAuthGuard rejects out-of-realm tokens", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("rejects an admin-realm JWT (signed with tenant secret, realm:'admin') on /me", async () => {
    const token = mintAdminRealmToken();
    const res = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_expired" });
  });

  it("rejects a tenant-realm refresh token used as a bearer access token", async () => {
    const token = mintRefreshAsAccess();
    const res = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_expired" });
  });

  it("rejects an admin-realm token on /v1/auth/logout (any authed tenant route)", async () => {
    const token = mintAdminRealmToken();
    const res = await request(booted.http)
      .post("/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_expired" });
  });

  it("rejects a REAL admin access token (signed with JWT_ADMIN_SECRET) on /v1/auth/me", async () => {
    // The token is structurally valid AND cryptographically valid against the
    // admin secret — but the tenant guard verifies against JWT_TENANT_SECRET,
    // so the signature check fails. This closes the realm-boundary loop:
    // 1.5b proved fake-admin (wrong secret, admin shape) is rejected; this
    // proves real-admin (right admin secret, wrong audience for this guard)
    // is also rejected.
    const a = await makePlatformUser({ emailPrefix: "tenant-canary-real-admin" });
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
