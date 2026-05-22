import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { parseSetCookie, REFRESH_COOKIE_NAME } from "../helpers/cookies";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

describe("POST /v1/auth/logout", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns 204, clears cookie, writes logout audit, and the refresh jti is dead afterwards", async () => {
    const t = await makeTenant({ slugPrefix: "logout-ok" });

    // Login to obtain access + refresh.
    const login = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: true });
    expect(login.status).toBe(200);
    const accessToken = login.body.access_token as string;
    const refreshCookie = parseSetCookie(login, REFRESH_COOKIE_NAME);
    expect(refreshCookie).not.toBeNull();

    // Logout.
    const out = await request(booted.http)
      .post("/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${refreshCookie!.value}`);
    expect(out.status).toBe(204);
    const cleared = parseSetCookie(out, REFRESH_COOKIE_NAME);
    expect(cleared).not.toBeNull();
    expect(cleared!.value).toBe("");

    const audit = await readAuditLog(t.tenantId, "logout");
    expect(audit).toHaveLength(1);

    // The refresh jti the cookie carried should be revoked: subsequent refresh
    // is treated as reuse → 401 refresh_replayed.
    const replay = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${refreshCookie!.value}`);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: "refresh_replayed" });
  });

  it("returns 401 access_missing when no Authorization header is supplied", async () => {
    const res = await request(booted.http).post("/v1/auth/logout");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_missing" });
  });

  it("tolerates a malformed refresh cookie (audit + revocation still succeed)", async () => {
    const t = await makeTenant({ slugPrefix: "logout-badcookie" });
    const tokens = booted.app.get(TokenService);
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });

    const res = await request(booted.http)
      .post("/v1/auth/logout")
      .set("Authorization", `Bearer ${pair.access_token}`)
      .set("Cookie", `${REFRESH_COOKIE_NAME}=garbage`);
    expect(res.status).toBe(204);

    const audit = await readAuditLog(t.tenantId, "logout");
    expect(audit).toHaveLength(1);
  });
});
