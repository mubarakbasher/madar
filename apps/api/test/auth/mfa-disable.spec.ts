import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
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

async function enableMfa(userId: string): Promise<void> {
  const secret = authenticator.generateSecret();
  const hashes = await Promise.all(["aaaa-bbbb", "cccc-dddd"].map((c) => argon2.hash(c.replace(/-/g, ""))));
  await adminPrisma.user.update({
    where: { id: userId },
    data: { mfa_enabled: true, mfa_secret: secret, mfa_recovery_codes_hash: hashes },
  });
}

describe("POST /v1/auth/mfa/disable", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy: clears mfa_* columns + audit row", async () => {
    const t = await makeTenant({ slugPrefix: "dis-ok" });
    await enableMfa(t.userId);
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/disable")
      .set("Authorization", `Bearer ${tok}`)
      .send({ password: t.password });
    expect(res.status).toBe(200);
    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.mfa_enabled).toBe(false);
    expect(u?.mfa_secret).toBeNull();
    expect(u?.mfa_recovery_codes_hash).toEqual([]);
    const audit = await readAuditLog(t.tenantId, "mfa_disabled");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("wrong password: 401 invalid_credentials, state unchanged", async () => {
    const t = await makeTenant({ slugPrefix: "dis-bad" });
    await enableMfa(t.userId);
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/disable")
      .set("Authorization", `Bearer ${tok}`)
      .send({ password: "WrongPassword999!" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.mfa_enabled).toBe(true);
  });

  it("when not enrolled: 409 mfa_not_enabled", async () => {
    const t = await makeTenant({ slugPrefix: "dis-noop" });
    const tok = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/mfa/disable")
      .set("Authorization", `Bearer ${tok}`)
      .send({ password: t.password });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("mfa_not_enabled");
  });

  it("during impersonation: 403 forbidden_during_impersonation", async () => {
    const t = await makeTenant({ slugPrefix: "dis-imper" });
    await enableMfa(t.userId);
    const tokens = booted.app.get(TokenService);
    const imper = await tokens.mintImpersonationAccess({
      tenantId: t.tenantId,
      targetUserId: t.userId,
      targetRole: "owner",
      impersonatorId: randomUUID(),
      impersonatorEmail: "admin@platform.test",
    });
    const res = await request(booted.http)
      .post("/v1/auth/mfa/disable")
      .set("Authorization", `Bearer ${imper.access_token}`)
      .send({ password: t.password });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_during_impersonation");
  });
});
