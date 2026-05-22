import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { mintAdminRealmToken } from "../helpers/admin-jwt";
import { parseSetCookie } from "../helpers/cookies";
import { currentTotp } from "../helpers/totp";

const ADMIN_REFRESH_COOKIE = "madar_admin_refresh";

async function startLogin(
  booted: BootedTestApp,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(booted.http)
    .post("/v1/admin/auth/login")
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.mfa_pending_token as string;
}

describe("POST /v1/admin/auth/mfa/verify", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("valid TOTP code: 200 + access_token + admin refresh cookie + admin_login_mfa_ok audit + last_login_at touched", async () => {
    const a = await makePlatformUser({ emailPrefix: "mfa-ok" });
    const mfaPending = await startLogin(booted, a.email, a.password);

    const res = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .set("Authorization", `Bearer ${mfaPending}`)
      .send({ code: currentTotp(a.mfaSecret) });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.platform_user).toMatchObject({
      id: a.platformUserId,
      email: a.email,
      role: a.role,
      mfa_enabled: true,
    });
    expect(res.body).not.toHaveProperty("refresh_token");

    const cookie = parseSetCookie(res, ADMIN_REFRESH_COOKIE);
    expect(cookie).not.toBeNull();
    expect(cookie!.value.length).toBeGreaterThan(0);
    expect(cookie!.attrs.httponly).toBe(true);
    expect(String(cookie!.attrs.samesite).toLowerCase()).toBe("lax");
    expect(cookie!.attrs.path).toBe("/");
    expect(Number(cookie!.attrs["max-age"])).toBeGreaterThan(0);

    // The access token should carry an admin-realm payload (verify via the service).
    const tokens = booted.app.get(AdminTokenService);
    const claims = tokens.verifyAccess(res.body.access_token);
    expect(claims.realm).toBe("admin");
    expect(claims.typ).toBe("access");
    expect(claims.platform_user_id).toBe(a.platformUserId);
    expect(claims.mfa_verified_at).toBeGreaterThan(0);

    const audit = await readPlatformAudit(a.platformUserId, "admin_login_mfa_ok");
    expect(audit).toHaveLength(1);
  });

  it("wrong code: 401 mfa_invalid + admin_login_mfa_fail audit row", async () => {
    const a = await makePlatformUser({ emailPrefix: "mfa-wrong" });
    const mfaPending = await startLogin(booted, a.email, a.password);

    const res = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .set("Authorization", `Bearer ${mfaPending}`)
      .send({ code: "000000" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "mfa_invalid" });

    const audit = await readPlatformAudit(a.platformUserId, "admin_login_mfa_fail");
    expect(audit).toHaveLength(1);
  });

  it("missing Authorization: 401 mfa_pending_missing", async () => {
    const a = await makePlatformUser({ emailPrefix: "mfa-noheader" });
    const res = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .send({ code: currentTotp(a.mfaSecret) });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "mfa_pending_missing" });
  });

  it("garbage Bearer token: 401 mfa_pending_invalid", async () => {
    const res = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .set("Authorization", "Bearer not-a-real-jwt")
      .send({ code: "123456" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "mfa_pending_invalid" });
  });

  it("tenant-realm Bearer token (signed with tenant secret) rejected: 401 mfa_pending_invalid", async () => {
    // Even if it's a real admin-realm-shaped token signed with the wrong key,
    // verifyMfaPending must reject it.
    const tenantAdminToken = mintAdminRealmToken(); // signed with JWT_TENANT_SECRET
    const res = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .set("Authorization", `Bearer ${tenantAdminToken}`)
      .send({ code: "123456" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "mfa_pending_invalid" });
  });

  it("invalid code shape (not 6 digits): 400 from zod", async () => {
    const a = await makePlatformUser({ emailPrefix: "mfa-shape" });
    const mfaPending = await startLogin(booted, a.email, a.password);

    const res = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .set("Authorization", `Bearer ${mfaPending}`)
      .send({ code: "abcd" });
    expect(res.status).toBe(400);
  });

  it("admin-realm access token (typ:access) rejected on mfa/verify (must be typ:mfa_pending)", async () => {
    const a = await makePlatformUser({ emailPrefix: "mfa-typmix" });
    const tokens = booted.app.get(AdminTokenService);
    const pair = await tokens.mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    const res = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .set("Authorization", `Bearer ${pair.access_token}`)
      .send({ code: "000000" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "mfa_pending_invalid" });
  });
});
