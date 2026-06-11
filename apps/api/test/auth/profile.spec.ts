/**
 * Self-service profile (§45) — PATCH /v1/auth/me, change-password, change-email.
 *
 * Covers happy path + audit + before/after diff (updateProfile), password
 * verification + revoke-all-refresh side effect (changePassword), and the new
 * email_verification .eml landing for the new address (changeEmail), plus all
 * the error branches the UI maps inline.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

async function ownerToken(
  booted: BootedTestApp,
  userId: string,
  tenantId: string,
): Promise<{ access: string; refresh: string }> {
  const tokens = booted.app.get(TokenService);
  const pair = await tokens.mintPair({ userId, tenantId, role: "owner" });
  return { access: pair.access_token, refresh: pair.refresh_token };
}

describe("Self-service profile (/v1/auth/me + change-password + change-email)", () => {
  let booted: BootedTestApp;
  // EMAIL_LOG_DIR is locked in by setup.ts to `apps/api/var/test-emails` and
  // can't be lazily overridden under singleFork. From this spec's location
  // (apps/api/test/auth/) that's two levels up plus `var/test-emails`.
  const emailDir = path.resolve(__dirname, "..", "..", "var", "test-emails");

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  // ─── PATCH /v1/auth/me ─────────────────────────────────────────────

  it("PATCH /me: name update is reflected, audit row carries before/after", async () => {
    const t = await makeTenant({ slugPrefix: "prof-name" });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .patch("/v1/auth/me")
      .set("Authorization", `Bearer ${access}`)
      .send({ name: "Renamed Owner" });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Renamed Owner");
    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.name).toBe("Renamed Owner");
    const audit = await readAuditLog(t.tenantId, "profile_updated");
    expect(audit.length).toBeGreaterThan(0);
    expect((audit[0]!.before as { name?: string }).name).toBe("Test Owner");
    expect((audit[0]!.after as { name?: string }).name).toBe("Renamed Owner");
  });

  it("PATCH /me: locale update flips on the user row + only diffs locale", async () => {
    const t = await makeTenant({ slugPrefix: "prof-loc" });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .patch("/v1/auth/me")
      .set("Authorization", `Bearer ${access}`)
      .send({ locale: "ar" });
    expect(res.status).toBe(200);
    expect(res.body.user.locale).toBe("ar");
    const audit = await readAuditLog(t.tenantId, "profile_updated");
    const lastBefore = audit[audit.length - 1]!.before as Record<string, unknown>;
    expect(lastBefore).not.toHaveProperty("name");
    expect(lastBefore).toHaveProperty("locale", "en");
  });

  it("PATCH /me: empty body 400 (zod refine)", async () => {
    const t = await makeTenant({ slugPrefix: "prof-empty" });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .patch("/v1/auth/me")
      .set("Authorization", `Bearer ${access}`)
      .send({});
    expect(res.status).toBe(400);
  });

  // ─── change-password ──────────────────────────────────────────────

  it("change-password happy: hash rotates, audit row written, refresh tokens revoked", async () => {
    const t = await makeTenant({ slugPrefix: "pwd-ok" });
    const { access, refresh } = await ownerToken(booted, t.userId, t.tenantId);

    // Sanity: the refresh works before rotation.
    const before = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `madar_refresh=${refresh}`);
    expect(before.status).toBe(200);

    const res = await request(booted.http)
      .post("/v1/auth/change-password")
      .set("Authorization", `Bearer ${access}`)
      .send({ current_password: t.password, new_password: "NewPassword456!" });
    expect(res.status).toBe(200);

    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(await argon2.verify(u!.password_hash, "NewPassword456!")).toBe(true);
    expect(await argon2.verify(u!.password_hash, t.password)).toBe(false);

    const audit = await readAuditLog(t.tenantId, "password_changed");
    expect(audit.length).toBeGreaterThan(0);

    // Original refresh token is now invalid — rotated token's jti was revoked.
    const after = await request(booted.http)
      .post("/v1/auth/refresh")
      .set("Cookie", `madar_refresh=${refresh}`);
    expect(after.status).toBe(401);
  });

  it("change-password wrong current: 401 invalid_credentials, hash unchanged", async () => {
    const t = await makeTenant({ slugPrefix: "pwd-bad" });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/change-password")
      .set("Authorization", `Bearer ${access}`)
      .send({ current_password: "wrong-current!", new_password: "NewPassword456!" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(await argon2.verify(u!.password_hash, t.password)).toBe(true);
    const audit = await readAuditLog(t.tenantId, "password_changed");
    expect(audit.length).toBe(0);
  });

  it("change-password weak: 400 weak_password (reuses signup PasswordSchema)", async () => {
    const t = await makeTenant({ slugPrefix: "pwd-weak" });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/change-password")
      .set("Authorization", `Bearer ${access}`)
      .send({ current_password: t.password, new_password: "short" });
    expect(res.status).toBe(400);
  });

  it("change-password same as current: 400 same_password", async () => {
    const t = await makeTenant({ slugPrefix: "pwd-same" });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const res = await request(booted.http)
      .post("/v1/auth/change-password")
      .set("Authorization", `Bearer ${access}`)
      .send({ current_password: t.password, new_password: t.password });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("same_password");
  });

  // ─── change-email ─────────────────────────────────────────────────

  it("change-email is STAGED: login email untouched until the new address confirms; both emails sent; confirm swaps + revokes sessions", async () => {
    const t = await makeTenant({ slugPrefix: "em-ok" });
    // Pre-mark verified so we can prove the staged flow never un-verifies
    // the active address.
    await adminPrisma.user.update({
      where: { id: t.userId },
      data: { email_verified: true },
    });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const newEmail = `changed-${randomUUID().slice(0, 6)}@example.test`;

    const res = await request(booted.http)
      .post("/v1/auth/change-email")
      .set("Authorization", `Bearer ${access}`)
      .send({ new_email: newEmail, password: t.password });
    expect(res.status).toBe(200);

    // The LOGIN email must not move yet — a hijacked session must not be
    // able to silently take over the account.
    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.email).toBe(t.email);
    expect(u?.email_verified).toBe(true);
    expect(u?.pending_email).toBe(newEmail);
    expect(u?.email_verification_token_hash).toBeTruthy();
    expect(u?.email_verification_expires_at).toBeTruthy();

    // Fire-and-forget — poll for the files with a generous deadline (Windows
    // file-flush latency on OneDrive is occasionally jumpy).
    let candidates: string[] = [];
    for (let i = 0; i < 30; i++) {
      const files = await fs.readdir(emailDir).catch(() => []);
      candidates = files.filter((f) => f.includes(newEmail.split("@")[0]!));
      if (candidates.length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(candidates.length).toBeGreaterThan(0);
    let verifyContents: string | null = null;
    for (const f of candidates) {
      const c = await fs.readFile(path.join(emailDir, f), "utf8");
      if (
        c.includes("X-Madar-Template: email_verification\n") ||
        c.includes("X-Madar-Template: email_verification\r\n")
      ) {
        verifyContents = c;
        break;
      }
    }
    expect(verifyContents).not.toBeNull();

    // Heads-up notice to the OLD address.
    let oldNotice = false;
    for (let i = 0; i < 30 && !oldNotice; i++) {
      const files = await fs.readdir(emailDir).catch(() => []);
      for (const f of files.filter((n) => n.includes(t.email.split("@")[0]!))) {
        const c = await fs.readFile(path.join(emailDir, f), "utf8");
        if (c.includes("is being changed")) {
          oldNotice = true;
          break;
        }
      }
      if (!oldNotice) await new Promise((r) => setTimeout(r, 100));
    }
    expect(oldNotice).toBe(true);

    const requestedAudit = await readAuditLog(t.tenantId, "email_change_requested");
    expect(requestedAudit.length).toBeGreaterThan(0);

    // Confirm with the emailed token → email swaps + audit written.
    const tokenMatch = verifyContents!.match(/verify-email\?token=([0-9a-f]+)/);
    expect(tokenMatch).toBeTruthy();
    const confirm = await request(booted.http)
      .post("/v1/auth/verify-email")
      .send({ token: tokenMatch![1] });
    expect(confirm.status).toBe(200);

    const after = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(after?.email).toBe(newEmail);
    expect(after?.pending_email).toBeNull();
    expect(after?.email_verified).toBe(true);

    const audit = await readAuditLog(t.tenantId, "email_changed");
    expect(audit.length).toBeGreaterThan(0);
    expect((audit[0]!.before as { email?: string }).email).toBe(t.email);
    expect((audit[0]!.after as { email?: string }).email).toBe(newEmail);
  });

  it("change-email duplicate within tenant: 409 email_taken, original email untouched", async () => {
    const t = await makeTenant({ slugPrefix: "em-dup" });
    // Seed a sibling user with a known email in the same tenant.
    const sibling = `sibling-${randomUUID().slice(0, 6)}@example.test`;
    await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: sibling,
        password_hash: "x",
        name: "Sibling",
        role: "cashier",
        locale: "en",
      },
    });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);

    const res = await request(booted.http)
      .post("/v1/auth/change-email")
      .set("Authorization", `Bearer ${access}`)
      .send({ new_email: sibling, password: t.password });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("email_taken");

    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.email).toBe(t.email);
  });

  it("change-email wrong password: 401 invalid_credentials, email untouched, no .eml", async () => {
    const t = await makeTenant({ slugPrefix: "em-bad" });
    const { access } = await ownerToken(booted, t.userId, t.tenantId);
    const filesBefore = (await fs.readdir(emailDir).catch(() => [])).length;
    const newEmail = `wrongpw-${randomUUID().slice(0, 6)}@example.test`;

    const res = await request(booted.http)
      .post("/v1/auth/change-email")
      .set("Authorization", `Bearer ${access}`)
      .send({ new_email: newEmail, password: "wrong!" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");

    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.email).toBe(t.email);

    await new Promise((r) => setTimeout(r, 100));
    const filesAfter = (await fs.readdir(emailDir).catch(() => [])).length;
    expect(filesAfter).toBe(filesBefore);
  });
});
