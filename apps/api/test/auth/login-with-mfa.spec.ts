import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant } from "../helpers/fixtures";

describe("POST /v1/auth/login — MFA branch", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
    authenticator.options = { window: 1, step: 30, digits: 6 };
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("mfa_enabled=false (regression): full pair returned + refresh cookie set", async () => {
    const t = await makeTenant({ slugPrefix: "mfa-off" });
    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: false });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.requires_mfa).toBeUndefined();
    expect(res.body.user.mfa_enabled).toBe(false);
  });

  it("mfa_enabled=true: returns requires_mfa + mfa_pending_token, NO refresh cookie", async () => {
    const t = await makeTenant({ slugPrefix: "mfa-on" });
    await adminPrisma.user.update({
      where: { id: t.userId },
      data: { mfa_enabled: true, mfa_secret: authenticator.generateSecret() },
    });
    const res = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: true });
    expect(res.status).toBe(200);
    expect(res.body.requires_mfa).toBe(true);
    expect(res.body.mfa_pending_token).toEqual(expect.any(String));
    expect(res.body.expires_in).toBeGreaterThan(0);
    expect(res.body.access_token).toBeUndefined();
    const setCookies = res.headers["set-cookie"];
    expect(setCookies ?? []).toHaveLength(0);
  });

  it("mfa_pending token validates against TenantMfaGuard (verifyMfaPending), realm/typ correct", async () => {
    const t = await makeTenant({ slugPrefix: "mfa-claims" });
    await adminPrisma.user.update({
      where: { id: t.userId },
      data: { mfa_enabled: true, mfa_secret: authenticator.generateSecret() },
    });
    const login = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password });
    const token = login.body.mfa_pending_token as string;
    const tokens = booted.app.get(TokenService);
    const claims = tokens.verifyMfaPending(token);
    expect(claims.realm).toBe("tenant");
    expect(claims.typ).toBe("mfa_pending");
    expect(claims.user_id).toBe(t.userId);
    expect(claims.tenant_id).toBe(t.tenantId);
  });
});
