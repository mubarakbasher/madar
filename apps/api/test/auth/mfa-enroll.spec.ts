import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { authenticator } from "otplib";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

async function ownerToken(booted: BootedTestApp, userId: string, tenantId: string): Promise<string> {
  const tokens = booted.app.get(TokenService);
  const pair = await tokens.mintPair({ userId, tenantId, role: "owner" });
  return pair.access_token;
}

describe("POST /v1/auth/mfa/enroll/start + /verify", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
    authenticator.options = { window: 1, step: 30, digits: 6 };
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("enroll/start returns secret + URI for a fresh user", async () => {
    const t = await makeTenant({ slugPrefix: "en-start" });
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/enroll/start")
      .set("Authorization", `Bearer ${tok}`)
      .set("Idempotency-Key", randomUUID())
      .send();
    expect(res.status).toBe(200);
    expect(res.body.secret_b32).toEqual(expect.any(String));
    expect(res.body.provisioning_uri.startsWith("otpauth://")).toBe(true);
  });

  it("enroll/start when already enabled: 409 mfa_already_enabled", async () => {
    const t = await makeTenant({ slugPrefix: "en-already" });
    await adminPrisma.user.update({
      where: { id: t.userId },
      data: { mfa_enabled: true, mfa_secret: authenticator.generateSecret() },
    });
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/enroll/start")
      .set("Authorization", `Bearer ${tok}`)
      .set("Idempotency-Key", randomUUID())
      .send();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("mfa_already_enabled");
  });

  it("enroll/verify happy: mfa_enabled true + 10 recovery_codes + audit", async () => {
    const t = await makeTenant({ slugPrefix: "en-verify" });
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    const start = await request(booted.http)
      .post("/v1/auth/mfa/enroll/start")
      .set("Authorization", `Bearer ${tok}`)
      .set("Idempotency-Key", randomUUID())
      .send();
    const secret = start.body.secret_b32 as string;

    const res = await request(booted.http)
      .post("/v1/auth/mfa/enroll/verify")
      .set("Authorization", `Bearer ${tok}`)
      .send({ code: authenticator.generate(secret) });
    expect(res.status).toBe(200);
    expect(res.body.recovery_codes).toHaveLength(10);
    expect(res.body.recovery_codes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);

    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.mfa_enabled).toBe(true);
    expect(u?.mfa_secret).toBe(secret);
    expect(u?.mfa_recovery_codes_hash.length).toBe(10);

    const audit = await readAuditLog(t.tenantId, "mfa_enabled");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("enroll/verify with wrong code: 401 mfa_invalid", async () => {
    const t = await makeTenant({ slugPrefix: "en-wrong" });
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    await request(booted.http)
      .post("/v1/auth/mfa/enroll/start")
      .set("Authorization", `Bearer ${tok}`)
      .set("Idempotency-Key", randomUUID())
      .send();
    const res = await request(booted.http)
      .post("/v1/auth/mfa/enroll/verify")
      .set("Authorization", `Bearer ${tok}`)
      .send({ code: "000000" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("mfa_invalid");
  });

  it("enroll/verify without start: 410 enroll_expired", async () => {
    const t = await makeTenant({ slugPrefix: "en-nostart" });
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/enroll/verify")
      .set("Authorization", `Bearer ${tok}`)
      .send({ code: "123456" });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("enroll_expired");
  });
});
