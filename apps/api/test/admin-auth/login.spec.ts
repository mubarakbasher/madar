import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";

describe("POST /v1/admin/auth/login", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy path: 200 with mfa_pending_token + writes admin_login_password_ok audit", async () => {
    const a = await makePlatformUser({ emailPrefix: "login-ok" });
    const res = await request(booted.http)
      .post("/v1/admin/auth/login")
      .send({ email: a.email, password: a.password });

    expect(res.status).toBe(200);
    expect(res.body.mfa_pending_token).toEqual(expect.any(String));
    expect(res.body.mfa_pending_expires_in).toBeGreaterThan(0);
    // No access token issued at step 1.
    expect(res.body).not.toHaveProperty("access_token");
    // No refresh cookie before MFA.
    const setCookie = res.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    expect(cookies.some((c) => c.startsWith("madar_admin_refresh="))).toBe(false);

    const audit = await readPlatformAudit(a.platformUserId, "admin_login_password_ok");
    expect(audit).toHaveLength(1);
  });

  it("wrong password: 401 invalid_credentials + audits admin_login_password_fail", async () => {
    const a = await makePlatformUser({ emailPrefix: "login-bad" });
    const res = await request(booted.http)
      .post("/v1/admin/auth/login")
      .send({ email: a.email, password: "WrongPassword!" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "invalid_credentials" });

    const audit = await readPlatformAudit(a.platformUserId, "admin_login_password_fail");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toMatchObject({ reason: "bad_password" });
  });

  it("unknown email: 401 invalid_credentials (no audit — no user to attribute)", async () => {
    const res = await request(booted.http)
      .post("/v1/admin/auth/login")
      .send({ email: "ghost-platform@nowhere.test", password: "Anything1!" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "invalid_credentials" });
  });

  it("mfa_enabled=false admin: 403 mfa_not_enrolled (gate, no access token issued)", async () => {
    const a = await makePlatformUser({ emailPrefix: "login-nomfa", mfaEnabled: false });
    const res = await request(booted.http)
      .post("/v1/admin/auth/login")
      .send({ email: a.email, password: a.password });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "mfa_not_enrolled" });
  });

  it("400 from zod for an invalid email", async () => {
    const res = await request(booted.http)
      .post("/v1/admin/auth/login")
      .send({ email: "not-an-email", password: "x" });
    expect(res.status).toBe(400);
  });

  it("enforces per-email 10/min rate limit when NODE_ENV=production", async () => {
    const a = await makePlatformUser({ emailPrefix: "login-rl" });
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      let saw429 = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(booted.http)
          .post("/v1/admin/auth/login")
          .send({ email: a.email, password: "WrongPassword!" });
        if (res.status === 429) {
          saw429 = true;
          expect(res.body).toMatchObject({ code: "rate_limited" });
          break;
        }
      }
      expect(saw429).toBe(true);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
