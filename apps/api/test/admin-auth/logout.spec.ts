import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { parseSetCookie } from "../helpers/cookies";
import { currentTotp } from "../helpers/totp";

const ADMIN_REFRESH_COOKIE = "madar_admin_refresh";

describe("POST /v1/admin/auth/logout", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("204 + clears cookie + admin_logout audit + refresh jti revoked", async () => {
    const a = await makePlatformUser({ emailPrefix: "logout-ok" });

    const login = await request(booted.http)
      .post("/v1/admin/auth/login")
      .send({ email: a.email, password: a.password });
    expect(login.status).toBe(200);

    const mfa = await request(booted.http)
      .post("/v1/admin/auth/mfa/verify")
      .set("Authorization", `Bearer ${login.body.mfa_pending_token}`)
      .send({ code: currentTotp(a.mfaSecret) });
    expect(mfa.status).toBe(200);
    const accessToken = mfa.body.access_token as string;
    const cookie = parseSetCookie(mfa, ADMIN_REFRESH_COOKIE);
    expect(cookie).not.toBeNull();

    const out = await request(booted.http)
      .post("/v1/admin/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=${cookie!.value}`);
    expect(out.status).toBe(204);
    const cleared = parseSetCookie(out, ADMIN_REFRESH_COOKIE);
    expect(cleared).not.toBeNull();
    expect(cleared!.value).toBe("");

    const audit = await readPlatformAudit(a.platformUserId, "admin_logout");
    expect(audit).toHaveLength(1);

    // Refresh jti is revoked → reuse is treated as replay.
    const replay = await request(booted.http)
      .post("/v1/admin/auth/refresh")
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=${cookie!.value}`);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: "admin_refresh_replayed" });
  });

  it("401 admin_access_missing when no Authorization header", async () => {
    const res = await request(booted.http).post("/v1/admin/auth/logout");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_missing" });
  });

  it("204 with malformed refresh cookie — audit + cleanup still proceed", async () => {
    const a = await makePlatformUser({ emailPrefix: "logout-badcookie" });
    const tokens = booted.app.get(AdminTokenService);
    const pair = await tokens.mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });

    const res = await request(booted.http)
      .post("/v1/admin/auth/logout")
      .set("Authorization", `Bearer ${pair.access_token}`)
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=garbage`);
    expect(res.status).toBe(204);

    const audit = await readPlatformAudit(a.platformUserId, "admin_logout");
    expect(audit).toHaveLength(1);
  });
});
