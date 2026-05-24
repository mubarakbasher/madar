import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";

function mintToken(
  tokens: AdminTokenService,
  opts: { platformUserId: string; email: string; role: string },
) {
  return tokens.mintAccessPair({
    platformUserId: opts.platformUserId,
    email: opts.email,
    role: opts.role,
    mfaVerifiedAt: Math.floor(Date.now() / 1000),
  });
}

describe("Admin Team CRUD — /v1/admin/team", () => {
  let booted: BootedTestApp;
  let tokens: AdminTokenService;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(AdminTokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  // ─── List ──────────────────────────────────────────────────────────

  describe("GET /v1/admin/team", () => {
    it("returns all users with correct shape (no sensitive fields)", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-list-owner", role: "owner" });
      const pair = await mintToken(tokens, owner);

      const res = await request(booted.http)
        .get("/v1/admin/team")
        .set("Authorization", `Bearer ${pair.access_token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const first = res.body[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("email");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("role");
      expect(first).toHaveProperty("mfa_enabled");
      expect(first).toHaveProperty("is_active");
      expect(first).toHaveProperty("last_login_at");
      expect(first).toHaveProperty("created_at");
      expect(first).toHaveProperty("has_pending_invite");
      // Sensitive fields never exposed
      expect(first).not.toHaveProperty("password_hash");
      expect(first).not.toHaveProperty("mfa_secret");
      expect(first).not.toHaveProperty("invite_token_hash");
    });

    it("non-owner gets 403", async () => {
      const fin = await makePlatformUser({ emailPrefix: "team-list-fin", role: "finance" });
      const pair = await mintToken(tokens, fin);

      const res = await request(booted.http)
        .get("/v1/admin/team")
        .set("Authorization", `Bearer ${pair.access_token}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "insufficient_permission" });
    });

    it("anonymous gets 401", async () => {
      const res = await request(booted.http).get("/v1/admin/team");
      expect(res.status).toBe(401);
    });
  });

  // ─── Invite ────────────────────────────────────────────────────────

  describe("POST /v1/admin/team/invite", () => {
    it("creates inactive user + sends email + writes audit", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-inv-owner", role: "owner" });
      const pair = await mintToken(tokens, owner);
      const inviteEmail = `invite-${Date.now()}@test.dev`;

      const res = await request(booted.http)
        .post("/v1/admin/team/invite")
        .set("Authorization", `Bearer ${pair.access_token}`)
        .send({ email: inviteEmail, name: "Invited User", role: "support" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        email: inviteEmail,
        name: "Invited User",
        role: "support",
        is_active: false,
        has_pending_invite: true,
      });

      // Verify user in DB
      const user = await adminPrisma.platformUser.findUnique({ where: { email: inviteEmail } });
      expect(user).not.toBeNull();
      expect(user!.is_active).toBe(false);
      expect(user!.invite_token_hash).not.toBeNull();
      expect(user!.invite_expires_at).not.toBeNull();
      expect(user!.password_hash).toBe("!not-set");

      // Audit
      const audit = await readPlatformAudit(owner.platformUserId, "team_member.invited");
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });

    it("duplicate email returns 409", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-inv-dup", role: "owner" });
      const pair = await mintToken(tokens, owner);

      const res = await request(booted.http)
        .post("/v1/admin/team/invite")
        .set("Authorization", `Bearer ${pair.access_token}`)
        .send({ email: owner.email, name: "Dup", role: "finance" });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "email_taken" });
    });

    it("non-owner gets 403", async () => {
      const fin = await makePlatformUser({ emailPrefix: "team-inv-fin", role: "finance" });
      const pair = await mintToken(tokens, fin);

      const res = await request(booted.http)
        .post("/v1/admin/team/invite")
        .set("Authorization", `Bearer ${pair.access_token}`)
        .send({ email: "someone@test.dev", name: "Someone", role: "support" });

      expect(res.status).toBe(403);
    });
  });

  // ─── Accept invite ─────────────────────────────────────────────────

  describe("POST /v1/admin/team/accept-invite", () => {
    it("happy path: activates user and sets password", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-acc-own", role: "owner" });
      const pair = await mintToken(tokens, owner);
      const inviteEmail = `accept-${Date.now()}@test.dev`;

      // Create invite
      await request(booted.http)
        .post("/v1/admin/team/invite")
        .set("Authorization", `Bearer ${pair.access_token}`)
        .send({ email: inviteEmail, name: "Accept Test", role: "developer" });

      // Get raw token from DB (in production it goes via email; in test we read it)
      const user = await adminPrisma.platformUser.findUnique({ where: { email: inviteEmail } });
      expect(user).not.toBeNull();

      // We need the raw token. Since we hash it with SHA-256 before storing,
      // we cannot reverse it. Instead we test the flow by calling accept-invite
      // with a known token. Let's manually set a known hash.
      const { createHash, randomBytes } = await import("node:crypto");
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      await adminPrisma.platformUser.update({
        where: { id: user!.id },
        data: {
          invite_token_hash: tokenHash,
          invite_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(booted.http)
        .post("/v1/admin/team/accept-invite")
        .send({ token: rawToken, password: "SuperSecure12!" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true });

      // Verify user is now active with cleared invite columns
      const updated = await adminPrisma.platformUser.findUnique({ where: { id: user!.id } });
      expect(updated!.is_active).toBe(true);
      expect(updated!.invite_token_hash).toBeNull();
      expect(updated!.invite_expires_at).toBeNull();
      expect(updated!.password_hash).not.toBe("!not-set");

      // Verify password works with argon2
      const argon2 = await import("argon2");
      const valid = await argon2.verify(updated!.password_hash, "SuperSecure12!");
      expect(valid).toBe(true);
    });

    it("expired/invalid token returns 400", async () => {
      const res = await request(booted.http)
        .post("/v1/admin/team/accept-invite")
        .send({ token: "nonexistent-token-value", password: "SecurePass123!" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "invite_invalid" });
    });
  });

  // ─── Update role ───────────────────────────────────────────────────

  describe("PATCH /v1/admin/team/:id/role", () => {
    it("happy path: updates role + writes audit", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-role-own", role: "owner" });
      const target = await makePlatformUser({ emailPrefix: "team-role-tgt", role: "finance" });
      const pair = await mintToken(tokens, owner);

      const res = await request(booted.http)
        .patch(`/v1/admin/team/${target.platformUserId}/role`)
        .set("Authorization", `Bearer ${pair.access_token}`)
        .send({ role: "support" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: target.platformUserId, role: "support" });

      const audit = await readPlatformAudit(owner.platformUserId, "team_member.role_updated");
      expect(audit.length).toBeGreaterThanOrEqual(1);
      expect(audit[0]!.metadata).toMatchObject({ from: "finance", to: "support" });
    });

    it("cannot change own role", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-role-self", role: "owner" });
      const pair = await mintToken(tokens, owner);

      const res = await request(booted.http)
        .patch(`/v1/admin/team/${owner.platformUserId}/role`)
        .set("Authorization", `Bearer ${pair.access_token}`)
        .send({ role: "finance" });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "cannot_edit_self" });
    });

    it("cannot demote owner", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-role-o1", role: "owner" });
      const target = await makePlatformUser({ emailPrefix: "team-role-o2", role: "owner" });
      const pair = await mintToken(tokens, owner);

      const res = await request(booted.http)
        .patch(`/v1/admin/team/${target.platformUserId}/role`)
        .set("Authorization", `Bearer ${pair.access_token}`)
        .send({ role: "readonly" });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "cannot_demote_owner" });
    });
  });

  // ─── Deactivate / Reactivate ───────────────────────────────────────

  describe("POST /v1/admin/team/:id/deactivate", () => {
    it("deactivates user and blocks login", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-deact-own", role: "owner" });
      const target = await makePlatformUser({ emailPrefix: "team-deact-tgt", role: "support" });
      const pair = await mintToken(tokens, owner);

      const deactRes = await request(booted.http)
        .post(`/v1/admin/team/${target.platformUserId}/deactivate`)
        .set("Authorization", `Bearer ${pair.access_token}`);

      expect(deactRes.status).toBe(201);
      expect(deactRes.body).toMatchObject({ id: target.platformUserId, is_active: false });

      // Attempt login — should be blocked
      const loginRes = await request(booted.http)
        .post("/v1/admin/auth/login")
        .send({ email: target.email, password: target.password });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body).toMatchObject({ code: "account_deactivated" });
    });

    it("cannot deactivate self", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-deact-self", role: "owner" });
      const pair = await mintToken(tokens, owner);

      const res = await request(booted.http)
        .post(`/v1/admin/team/${owner.platformUserId}/deactivate`)
        .set("Authorization", `Bearer ${pair.access_token}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "cannot_deactivate_self" });
    });

    it("cannot deactivate owner", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-deact-o1", role: "owner" });
      const target = await makePlatformUser({ emailPrefix: "team-deact-o2", role: "owner" });
      const pair = await mintToken(tokens, owner);

      const res = await request(booted.http)
        .post(`/v1/admin/team/${target.platformUserId}/deactivate`)
        .set("Authorization", `Bearer ${pair.access_token}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "cannot_deactivate_owner" });
    });
  });

  describe("POST /v1/admin/team/:id/reactivate", () => {
    it("reactivates deactivated user", async () => {
      const owner = await makePlatformUser({ emailPrefix: "team-react-own", role: "owner" });
      const target = await makePlatformUser({ emailPrefix: "team-react-tgt", role: "developer" });
      const pair = await mintToken(tokens, owner);

      // First deactivate
      await request(booted.http)
        .post(`/v1/admin/team/${target.platformUserId}/deactivate`)
        .set("Authorization", `Bearer ${pair.access_token}`);

      // Then reactivate
      const res = await request(booted.http)
        .post(`/v1/admin/team/${target.platformUserId}/reactivate`)
        .set("Authorization", `Bearer ${pair.access_token}`);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: target.platformUserId, is_active: true });

      const audit = await readPlatformAudit(owner.platformUserId, "team_member.reactivated");
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });
  });
});
