import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { parseSetCookie, REFRESH_COOKIE_NAME } from "../helpers/cookies";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

async function loginAndGetRefresh(
  booted: BootedTestApp,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(booted.http)
    .post("/v1/auth/login")
    .send({ email, password, remember: true });
  expect(res.status).toBe(200);
  const cookie = parseSetCookie(res, REFRESH_COOKIE_NAME);
  expect(cookie).not.toBeNull();
  return cookie!.value;
}

describe("POST /v1/auth/refresh", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns 401 refresh_missing and clears the cookie when no cookie is sent", async () => {
    const res = await request(booted.http).post("/v1/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "refresh_missing" });
    const cleared = parseSetCookie(res, REFRESH_COOKIE_NAME);
    expect(cleared).not.toBeNull();
    expect(cleared!.value).toBe("");
  });

  it("rotates: returns new access_token, new refresh jti, writes refresh_token_rotated audit", async () => {
    const t = await makeTenant({ slugPrefix: "refresh-ok" });
    const oldRefresh = await loginAndGetRefresh(booted, t.email, t.password);
    const tokens = booted.app.get(TokenService);
    const oldClaims = tokens.verifyRefresh(oldRefresh);

    const res = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${oldRefresh}`);

    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));

    const newCookie = parseSetCookie(res, REFRESH_COOKIE_NAME);
    expect(newCookie).not.toBeNull();
    expect(newCookie!.value).not.toBe(oldRefresh);
    const newClaims = tokens.verifyRefresh(newCookie!.value);
    expect(newClaims.jti).not.toBe(oldClaims.jti);

    const audit = await readAuditLog(t.tenantId, "refresh_token_rotated");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after).toMatchObject({ jti_old: oldClaims.jti, jti_new: newClaims.jti });
  });

  it("replay of an already-rotated refresh token → 401 and revokes the whole family", async () => {
    const t = await makeTenant({ slugPrefix: "refresh-replay" });
    const r1 = await loginAndGetRefresh(booted, t.email, t.password);
    const r2 = await loginAndGetRefresh(booted, t.email, t.password); // sibling token

    // First rotate r1 successfully.
    const ok = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${r1}`);
    expect(ok.status).toBe(200);

    // Replay r1 — the jti is dead. Service should detect reuse and revoke
    // the entire family for this user.
    const replay = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${r1}`);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: "refresh_replayed" });
    const cleared = parseSetCookie(replay, REFRESH_COOKIE_NAME);
    expect(cleared).not.toBeNull();
    expect(cleared!.value).toBe("");

    // The sibling token issued before should now be dead too (family revoked).
    const sibling = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${r2}`);
    expect(sibling.status).toBe(401);
    expect(sibling.body).toMatchObject({ code: "refresh_replayed" });
  });

  it("returns 401 refresh_invalid for a malformed refresh token", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=not-a-real-token`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "refresh_invalid" });
  });
});
