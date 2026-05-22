import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function seedResetToken(userId: string, opts: { expiresInMs?: number } = {}): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const hash = sha256Hex(raw);
  await adminPrisma.user.update({
    where: { id: userId },
    data: {
      password_reset_token_hash: hash,
      password_reset_expires_at: new Date(Date.now() + (opts.expiresInMs ?? 60 * 60 * 1000)),
    },
  });
  return raw;
}

describe("POST /v1/auth/reset-password", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy path: password changes, token cleared, audit written, can login with new password", async () => {
    const t = await makeTenant({ slugPrefix: "rp-ok" });
    const raw = await seedResetToken(t.userId);

    const res = await request(booted.http)
      .post("/v1/auth/reset-password")
      .send({ token: raw, new_password: "NewSecret123!" });
    expect(res.status).toBe(200);

    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.password_reset_token_hash).toBeNull();
    expect(u?.password_reset_expires_at).toBeNull();

    const audit = await readAuditLog(t.tenantId, "password_reset_completed");
    expect(audit.length).toBeGreaterThan(0);

    // Old password rejected.
    const oldLogin = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password });
    expect(oldLogin.status).toBe(401);

    // New password works.
    const newLogin = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: "NewSecret123!" });
    expect(newLogin.status).toBe(200);
  });

  it("invalid token: 404 invalid_token", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/reset-password")
      .send({ token: "a".repeat(64), new_password: "NewSecret123!" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("invalid_token");
  });

  it("expired token: 410 reset_token_expired", async () => {
    const t = await makeTenant({ slugPrefix: "rp-exp" });
    const raw = await seedResetToken(t.userId, { expiresInMs: -1000 });
    const res = await request(booted.http)
      .post("/v1/auth/reset-password")
      .send({ token: raw, new_password: "NewSecret123!" });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("reset_token_expired");
  });

  it("token consumed once: replay returns 404", async () => {
    const t = await makeTenant({ slugPrefix: "rp-once" });
    const raw = await seedResetToken(t.userId);
    const r1 = await request(booted.http)
      .post("/v1/auth/reset-password")
      .send({ token: raw, new_password: "NewSecret123!" });
    expect(r1.status).toBe(200);
    const r2 = await request(booted.http)
      .post("/v1/auth/reset-password")
      .send({ token: raw, new_password: "AnotherSecret456!" });
    expect(r2.status).toBe(404);
  });

  it("server-min weak password: 400 validation_failed", async () => {
    const t = await makeTenant({ slugPrefix: "rp-weak" });
    const raw = await seedResetToken(t.userId);
    const res = await request(booted.http)
      .post("/v1/auth/reset-password")
      .send({ token: raw, new_password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("revokes all refresh tokens for the user (old cookie no longer refreshes)", async () => {
    const t = await makeTenant({ slugPrefix: "rp-revoke" });
    // First login to mint a refresh cookie.
    const login = await request(booted.http)
      .post("/v1/auth/login")
      .send({ email: t.email, password: t.password, remember: true });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(cookie).toBeTruthy();
    // Reset the password.
    const raw = await seedResetToken(t.userId);
    const reset = await request(booted.http)
      .post("/v1/auth/reset-password")
      .send({ token: raw, new_password: "NewSecret123!" });
    expect(reset.status).toBe(200);
    // The old refresh cookie should now fail to refresh.
    const refresh = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", Array.isArray(cookie) ? cookie : [cookie!]);
    expect(refresh.status).toBe(401);
    expect(refresh.body.code).toBe("refresh_replayed");
  });
});
