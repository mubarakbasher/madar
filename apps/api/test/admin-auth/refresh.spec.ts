import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { parseSetCookie } from "../helpers/cookies";
import { currentTotp } from "../helpers/totp";

const ADMIN_REFRESH_COOKIE = "madar_admin_refresh";

async function fullyLogin(
  booted: BootedTestApp,
  email: string,
  password: string,
  mfaSecret: string,
): Promise<{ accessToken: string; refreshCookie: string }> {
  const login = await request(booted.http)
    .post("/v1/admin/auth/login")
    .send({ email, password });
  expect(login.status).toBe(200);
  const mfa = await request(booted.http)
    .post("/v1/admin/auth/mfa/verify")
    .set("Authorization", `Bearer ${login.body.mfa_pending_token}`)
    .send({ code: currentTotp(mfaSecret) });
  expect(mfa.status).toBe(200);
  const cookie = parseSetCookie(mfa, ADMIN_REFRESH_COOKIE);
  expect(cookie).not.toBeNull();
  return { accessToken: mfa.body.access_token, refreshCookie: cookie!.value };
}

describe("POST /v1/admin/auth/refresh", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("401 admin_refresh_missing + clears cookie when no cookie sent", async () => {
    const res = await request(booted.http).post("/v1/admin/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_refresh_missing" });
    const cleared = parseSetCookie(res, ADMIN_REFRESH_COOKIE);
    expect(cleared).not.toBeNull();
    expect(cleared!.value).toBe("");
  });

  it("rotates: new access token, new refresh jti, audits admin_token_refreshed", async () => {
    const a = await makePlatformUser({ emailPrefix: "refresh-ok" });
    const { refreshCookie } = await fullyLogin(booted, a.email, a.password, a.mfaSecret);
    const tokens = booted.app.get(AdminTokenService);
    const oldClaims = tokens.verifyRefresh(refreshCookie);

    const res = await request(booted.http)
      .post("/v1/admin/auth/refresh")
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=${refreshCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));

    const newCookie = parseSetCookie(res, ADMIN_REFRESH_COOKIE);
    expect(newCookie).not.toBeNull();
    expect(newCookie!.value).not.toBe(refreshCookie);
    const newClaims = tokens.verifyRefresh(newCookie!.value);
    expect(newClaims.jti).not.toBe(oldClaims.jti);

    const audit = await readPlatformAudit(a.platformUserId, "admin_token_refreshed");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toMatchObject({ jti_old: oldClaims.jti, jti_new: newClaims.jti });
  });

  it("replay of an already-rotated refresh → 401 admin_refresh_replayed + family revoked", async () => {
    const a = await makePlatformUser({ emailPrefix: "refresh-replay" });
    const first = await fullyLogin(booted, a.email, a.password, a.mfaSecret);
    const second = await fullyLogin(booted, a.email, a.password, a.mfaSecret); // sibling

    // Rotate first.
    const ok = await request(booted.http)
      .post("/v1/admin/auth/refresh")
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=${first.refreshCookie}`);
    expect(ok.status).toBe(200);

    // Replay first → should trip family revocation.
    const replay = await request(booted.http)
      .post("/v1/admin/auth/refresh")
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=${first.refreshCookie}`);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: "admin_refresh_replayed" });

    // Sibling token now also dead.
    const sibling = await request(booted.http)
      .post("/v1/admin/auth/refresh")
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=${second.refreshCookie}`);
    expect(sibling.status).toBe(401);
    expect(sibling.body).toMatchObject({ code: "admin_refresh_replayed" });
  });

  it("malformed refresh → 401 admin_refresh_invalid", async () => {
    const res = await request(booted.http)
      .post("/v1/admin/auth/refresh")
      .set("Cookie", `${ADMIN_REFRESH_COOKIE}=not-a-real-token`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_refresh_invalid" });
  });
});
