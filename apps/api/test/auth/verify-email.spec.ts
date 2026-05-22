import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function seedVerifyToken(userId: string, opts: { expiresInMs?: number } = {}): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const hash = sha256Hex(raw);
  await adminPrisma.user.update({
    where: { id: userId },
    data: {
      email_verified: false,
      email_verification_token_hash: hash,
      email_verification_expires_at: new Date(Date.now() + (opts.expiresInMs ?? 24 * 60 * 60 * 1000)),
    },
  });
  return raw;
}

describe("POST /v1/auth/verify-email", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy: 200 + email_verified true + audit + token cleared", async () => {
    const t = await makeTenant({ slugPrefix: "ve-ok" });
    const raw = await seedVerifyToken(t.userId);
    const res = await request(booted.http).post("/v1/auth/verify-email").send({ token: raw });
    expect(res.status).toBe(200);
    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.email_verified).toBe(true);
    expect(u?.email_verification_token_hash).toBeNull();
    const audit = await readAuditLog(t.tenantId, "email_verified");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("replay of consumed token: 404 invalid_token", async () => {
    const t = await makeTenant({ slugPrefix: "ve-once" });
    const raw = await seedVerifyToken(t.userId);
    const r1 = await request(booted.http).post("/v1/auth/verify-email").send({ token: raw });
    expect(r1.status).toBe(200);
    const r2 = await request(booted.http).post("/v1/auth/verify-email").send({ token: raw });
    expect(r2.status).toBe(404);
    expect(r2.body.code).toBe("invalid_token");
  });

  it("expired token: 410 verify_token_expired", async () => {
    const t = await makeTenant({ slugPrefix: "ve-exp" });
    const raw = await seedVerifyToken(t.userId, { expiresInMs: -1000 });
    const res = await request(booted.http).post("/v1/auth/verify-email").send({ token: raw });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("verify_token_expired");
  });

  it("invalid token: 404", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/verify-email")
      .send({ token: "a".repeat(64) });
    expect(res.status).toBe(404);
  });
});
