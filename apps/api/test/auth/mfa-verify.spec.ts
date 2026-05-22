import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import argon2 from "argon2";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

async function enableMfa(userId: string): Promise<{ secret: string; codes: string[]; hashes: string[] }> {
  authenticator.options = { window: 1, step: 30, digits: 6 };
  const secret = authenticator.generateSecret();
  const codes = ["abcd-1234", "efgh-5678", "wxyz-9999"];
  const hashes = await Promise.all(codes.map((c) => argon2.hash(c.toLowerCase().replace(/-/g, ""))));
  await adminPrisma.user.update({
    where: { id: userId },
    data: { mfa_enabled: true, mfa_secret: secret, mfa_recovery_codes_hash: hashes },
  });
  return { secret, codes, hashes };
}

async function startMfaLogin(booted: BootedTestApp, email: string, password: string): Promise<string> {
  const res = await request(booted.http).post("/v1/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.requires_mfa).toBe(true);
  return res.body.mfa_pending_token as string;
}

describe("POST /v1/auth/mfa/verify", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("valid TOTP: 200 + access pair + refresh cookie + mfa_verify_success audit", async () => {
    const t = await makeTenant({ slugPrefix: "mv-totp" });
    const { secret } = await enableMfa(t.userId);
    const mfaPending = await startMfaLogin(booted, t.email, t.password);
    const code = authenticator.generate(secret);

    const res = await request(booted.http)
      .post("/v1/auth/mfa/verify")
      .set("Authorization", `Bearer ${mfaPending}`)
      .send({ code });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.user.mfa_enabled).toBe(true);
    expect(res.headers["set-cookie"]).toBeTruthy();
    const audit = await readAuditLog(t.tenantId, "mfa_verify_success");
    expect(audit.some((a) => (a.after as { method?: string })?.method === "totp")).toBe(true);
  });

  it("wrong TOTP: 401 mfa_invalid + audit", async () => {
    const t = await makeTenant({ slugPrefix: "mv-wrong" });
    await enableMfa(t.userId);
    const mfaPending = await startMfaLogin(booted, t.email, t.password);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/verify")
      .set("Authorization", `Bearer ${mfaPending}`)
      .send({ code: "000000" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("mfa_invalid");
    const audit = await readAuditLog(t.tenantId, "mfa_verify_failure");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("valid recovery code: 200 + code consumed (length decreases) + audit method=recovery_code", async () => {
    const t = await makeTenant({ slugPrefix: "mv-rec" });
    const { codes } = await enableMfa(t.userId);
    const mfaPending = await startMfaLogin(booted, t.email, t.password);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/verify")
      .set("Authorization", `Bearer ${mfaPending}`)
      .send({ code: codes[0]! });
    expect(res.status).toBe(200);
    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.mfa_recovery_codes_hash.length).toBe(codes.length - 1);
    const audit = await readAuditLog(t.tenantId, "mfa_verify_success");
    expect(audit.some((a) => (a.after as { method?: string })?.method === "recovery_code")).toBe(true);
  });

  it("recovery code single-use: replay rejected (401 mfa_invalid)", async () => {
    const t = await makeTenant({ slugPrefix: "mv-rep" });
    const { codes } = await enableMfa(t.userId);
    const m1 = await startMfaLogin(booted, t.email, t.password);
    await request(booted.http)
      .post("/v1/auth/mfa/verify")
      .set("Authorization", `Bearer ${m1}`)
      .send({ code: codes[0]! });
    const m2 = await startMfaLogin(booted, t.email, t.password);
    const r = await request(booted.http)
      .post("/v1/auth/mfa/verify")
      .set("Authorization", `Bearer ${m2}`)
      .send({ code: codes[0]! });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("mfa_invalid");
  });

  it("mfa_pending single-use: second call with same pending token is rejected", async () => {
    const t = await makeTenant({ slugPrefix: "mv-pend" });
    const { secret } = await enableMfa(t.userId);
    const m = await startMfaLogin(booted, t.email, t.password);
    const ok = await request(booted.http)
      .post("/v1/auth/mfa/verify")
      .set("Authorization", `Bearer ${m}`)
      .send({ code: authenticator.generate(secret) });
    expect(ok.status).toBe(200);
    const replay = await request(booted.http)
      .post("/v1/auth/mfa/verify")
      .set("Authorization", `Bearer ${m}`)
      .send({ code: authenticator.generate(secret) });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("mfa_pending_invalid");
  });

  it("missing Bearer token: 401 mfa_pending_missing", async () => {
    const r = await request(booted.http).post("/v1/auth/mfa/verify").send({ code: "000000" });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("mfa_pending_missing");
  });
});
