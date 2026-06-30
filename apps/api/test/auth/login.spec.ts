import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { parseSetCookie, REFRESH_COOKIE_NAME } from "../helpers/cookies";
import { makeTenant, readAuditLog, setTenantStatus } from "../helpers/fixtures";

describe("POST /v1/auth/login", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy path with remember=true: 200, access_token, persistent refresh cookie, audit row", async () => {
    const t = await makeTenant({ slugPrefix: "loginok" });
    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: true });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: t.email, role: "owner" });
    expect(res.body.tenant).toMatchObject({ slug: t.slug, status: "trialing" });

    const cookie = parseSetCookie(res, REFRESH_COOKIE_NAME);
    expect(cookie).not.toBeNull();
    expect(cookie!.attrs.httponly).toBe(true);
    expect(String(cookie!.attrs.samesite).toLowerCase()).toBe("lax");
    expect(cookie!.attrs.path).toBe("/");
    expect(Number(cookie!.attrs["max-age"])).toBeGreaterThan(0);

    const audit = await readAuditLog(t.tenantId, "login_success");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after).toMatchObject({ remember: true });
  });

  it("remember=false omits Max-Age (session cookie)", async () => {
    const t = await makeTenant({ slugPrefix: "loginsess" });
    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: false });

    expect(res.status).toBe(200);
    const cookie = parseSetCookie(res, REFRESH_COOKIE_NAME);
    expect(cookie).not.toBeNull();
    expect(cookie!.attrs["max-age"]).toBeUndefined();
    expect(cookie!.attrs.expires).toBeUndefined();
    expect(cookie!.attrs.httponly).toBe(true);
  });

  it("returns 401 invalid_credentials for a wrong password and writes login_failure audit", async () => {
    const t = await makeTenant({ slugPrefix: "loginbad" });
    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: "WrongPassword1!", remember: false });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "invalid_credentials" });

    const audit = await readAuditLog(t.tenantId, "login_failure");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after).toMatchObject({ reason: "bad_password" });
  });

  it("returns 401 invalid_credentials for an unknown email (no audit because no tenant resolved)", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: "no-such-user@example.test", password: "AnyPassword1!", remember: false });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "invalid_credentials" });
  });

  it("lets a suspended tenant log in (read-only) so they can pay to reactivate", async () => {
    const t = await makeTenant({ slugPrefix: "loginsusp" });
    await setTenantStatus(t.tenantId, "suspended");

    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: false });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.tenant).toMatchObject({ slug: t.slug, status: "suspended" });

    // The read-only state is recorded on the login_success entry, and no
    // blocking audit is written anymore.
    const success = await readAuditLog(t.tenantId, "login_success");
    expect(success).toHaveLength(1);
    expect(success[0]!.after).toMatchObject({ tenant_status: "suspended" });
    const blocked = await readAuditLog(t.tenantId, "login_blocked_tenant_status");
    expect(blocked).toHaveLength(0);
  });

  it("lets a cancelled tenant log in (read-only) within the retention window", async () => {
    const t = await makeTenant({ slugPrefix: "logincanc" });
    await setTenantStatus(t.tenantId, "cancelled");

    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: false });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.tenant).toMatchObject({ slug: t.slug, status: "cancelled" });

    const success = await readAuditLog(t.tenantId, "login_success");
    expect(success).toHaveLength(1);
    expect(success[0]!.after).toMatchObject({ tenant_status: "cancelled" });
  });

  it("enforces the 10/min per-email rate limit when NODE_ENV=production", async () => {
    const t = await makeTenant({ slugPrefix: "loginrl" });
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      let saw429 = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(booted.http)
          .post("/v1/auth/login")
          .send({ email: t.email, password: "WrongPassword1!", remember: false });
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

  it("returns 400 from zod for an invalid email", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: "not-an-email", password: "x", remember: false });
    expect(res.status).toBe(400);
  });
});
