/**
 * Tenant Users (Settings → Users) — invite, list, patch, resend-invite.
 *
 * Email assertions read the disk-written .eml files from the default test
 * EMAIL_LOG_DIR set by `apps/api/test/setup.ts`. `loadEnv()` is cached on
 * first call, so changing EMAIL_LOG_DIR per-spec doesn't take effect when
 * we route through the booted Nest app's EmailService. We snapshot the
 * directory listing before/after each invite call and assert deltas
 * matching this spec's unique email addresses.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

// Default test-emails dir set by apps/api/test/setup.ts. Resolved lazily so
// we can settle on whatever the cached loadEnv() actually returned.
const EMAIL_DIR =
  process.env.EMAIL_LOG_DIR && path.isAbsolute(process.env.EMAIL_LOG_DIR)
    ? process.env.EMAIL_LOG_DIR
    : path.resolve(__dirname, "..", "var", "test-emails");

describe("Tenant Users (/v1/users)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  // Tenant A — primary fixture: owner + extra cashier + extra owner for last_owner_lock.
  let tenantA: Awaited<ReturnType<typeof makeTenant>>;
  let ownerTokenA: string;
  let cashierTokenA: string;
  let cashierIdA: string;
  let branchAId: string;

  // Tenant B — for RLS canary.
  let tenantB: Awaited<ReturnType<typeof makeTenant>>;
  let ownerTokenB: string;

  beforeAll(async () => {
    await fs.mkdir(EMAIL_DIR, { recursive: true });

    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    tenantA = await makeTenant({ slugPrefix: "users-a" });
    ownerTokenA = (
      await tokens.mintPair({ userId: tenantA.userId, tenantId: tenantA.tenantId, role: "owner" })
    ).access_token;

    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: tenantA.tenantId,
        code: `BR-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Main Branch", ar: "الفرع الرئيسي" },
        currency_code: "USD",
      },
    });
    branchAId = branch.id;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: tenantA.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier Carla",
        role: "cashier",
        locale: "en",
      },
    });
    cashierIdA = cashier.id;
    cashierTokenA = (
      await tokens.mintPair({ userId: cashier.id, tenantId: tenantA.tenantId, role: "cashier" })
    ).access_token;

    tenantB = await makeTenant({ slugPrefix: "users-b" });
    ownerTokenB = (
      await tokens.mintPair({ userId: tenantB.userId, tenantId: tenantB.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── 1. cashier 403 on every endpoint ─────────────────────────────

  it("cashier gets 403 on list / invite / patch / resend-invite", async () => {
    const list = await request(booted.http)
      .get("/v1/users")
      .set("Authorization", `Bearer ${cashierTokenA}`);
    expect(list.status).toBe(403);
    expect(list.body.code).toBe("forbidden_role");

    const invite = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${cashierTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        email: `nope-${randomUUID().slice(0, 6)}@example.test`,
        name: "Nope",
        role: "cashier",
      });
    expect(invite.status).toBe(403);
    expect(invite.body.code).toBe("forbidden_role");

    const patch = await request(booted.http)
      .patch(`/v1/users/${cashierIdA}`)
      .set("Authorization", `Bearer ${cashierTokenA}`)
      .send({ is_active: false });
    expect(patch.status).toBe(403);

    const resend = await request(booted.http)
      .post(`/v1/users/${cashierIdA}/resend-invite`)
      .set("Authorization", `Bearer ${cashierTokenA}`);
    expect(resend.status).toBe(403);

    const reset = await request(booted.http)
      .post(`/v1/users/${cashierIdA}/reset-password`)
      .set("Authorization", `Bearer ${cashierTokenA}`);
    expect(reset.status).toBe(403);
  });

  // ─── 2. owner happy invite + audit + .eml on disk ─────────────────

  it("owner can invite a teammate — audit row + email file land on disk", async () => {
    const email = `invitee-${randomUUID().slice(0, 6)}@example.test`;

    const res = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        email,
        name: "New Teammate",
        role: "accountant",
      });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body.role).toBe("accountant");
    expect(res.body.has_pending_invite).toBe(true);
    expect(res.body.is_active).toBe(true);
    expect(res.body.email_verified).toBe(false);

    const audit = await readAuditLog(tenantA.tenantId, "user_invited");
    expect(audit.length).toBeGreaterThan(0);
    const latest = audit[0]!;
    expect(latest.after).toMatchObject({ email, role: "accountant", invited_owner: false });

    // Allow microtask drain — email is fire-and-forget. Find the .eml whose
    // name contains the unique invitee email (filenames include the recipient).
    await new Promise((r) => setTimeout(r, 120));
    const sanitized = email.replace(/[^a-z0-9._@-]/gi, "_");
    const files = await fs.readdir(EMAIL_DIR);
    const file = files.find(
      (f) => f.endsWith(".eml") && f.includes("staff_invite") && f.includes(sanitized),
    );
    expect(
      file,
      `expected staff_invite .eml for ${sanitized}, got ${files.filter((f) => f.endsWith(".eml")).join(", ")}`,
    ).toBeDefined();

    const body = await fs.readFile(path.join(EMAIL_DIR, file!), "utf8");
    expect(body).toContain("Subject: You're invited to join");
    expect(body).toContain("/en/reset-password?token=");
    expect(body).toContain("X-Madar-Template: staff_invite");
    // The reset token in the URL is the plain-text version (64 hex chars).
    const tokenMatch = body.match(/reset-password\?token=([a-f0-9]{64})/);
    expect(tokenMatch).toBeTruthy();
  });

  // ─── 3. duplicate email → 409 email_taken ─────────────────────────

  it("duplicate email returns 409 email_taken", async () => {
    const email = `dup-${randomUUID().slice(0, 6)}@example.test`;
    const first = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ email, name: "First", role: "cashier" });
    expect(first.status).toBe(201);

    const second = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ email, name: "Second", role: "cashier" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("email_taken");
  });

  // ─── 4. manager without branch → 400 ──────────────────────────────

  it("inviting a manager without branch_id returns 400 manager_requires_branch", async () => {
    const res = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        email: `manager-${randomUUID().slice(0, 6)}@example.test`,
        name: "Manager Mo",
        role: "manager",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("manager_requires_branch");
  });

  // ─── 5. unknown branch → 422 ──────────────────────────────────────

  it("unknown branch returns 422 unknown_branch", async () => {
    const res = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        email: `ub-${randomUUID().slice(0, 6)}@example.test`,
        name: "Bad Branch",
        role: "manager",
        branch_id: randomUUID(),
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_branch");
  });

  // ─── 6. PATCH happy + audit before/after ──────────────────────────

  it("owner can patch role + writes audit before/after", async () => {
    const email = `patch-${randomUUID().slice(0, 6)}@example.test`;
    const create = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ email, name: "Patchable", role: "cashier" });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const res = await request(booted.http)
      .patch(`/v1/users/${id}`)
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .send({ role: "accountant" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("accountant");

    const audit = await readAuditLog(tenantA.tenantId, "user_updated");
    expect(audit.length).toBeGreaterThan(0);
    const latest = audit.find((a) => (a.after as { role?: string })?.role === "accountant");
    expect(latest).toBeDefined();
  });

  // ─── 7. PATCH self → 400 cannot_edit_self ─────────────────────────

  it("owner cannot edit their own membership (cannot_edit_self)", async () => {
    const res = await request(booted.http)
      .patch(`/v1/users/${tenantA.userId}`)
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .send({ is_active: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("cannot_edit_self");
  });

  // ─── 8. PATCH last_owner_lock ─────────────────────────────────────

  it("demoting the last active owner returns 409 last_owner_lock", async () => {
    // Build a fresh tenant with TWO active owners — owner1 (the actor) and
    // owner2 (the target). Demote owner2 → ok; then demote owner1 via owner2;
    // wait, simpler: create new tenant, invite a second owner, demote the
    // second owner via patch from the first → 409? No, that leaves one. We
    // need: a tenant where there's exactly ONE active owner and we try to
    // demote them — which fails the cannot_edit_self rule. So the failing
    // path: a tenant with two active owners, the actor (owner1) demotes
    // owner2 AFTER having deactivated themselves. Hard to set up via the
    // API since cannot_edit_self blocks owner1 from going inactive.
    //
    // Direct DB seed: tenant with two owners, but one is inactive. Then the
    // active-owner count for OTHER active owners is 0, and demoting the only
    // remaining active owner triggers last_owner_lock.
    const lock = await makeTenant({ slugPrefix: "lock" });
    const lockToken = (
      await tokens.mintPair({ userId: lock.userId, tenantId: lock.tenantId, role: "owner" })
    ).access_token;
    // Seed a second owner that's inactive — so there's only ONE active owner.
    const target = await adminPrisma.user.create({
      data: {
        tenant_id: lock.tenantId,
        email: `owner2-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Inactive Owner",
        role: "owner",
        is_active: false, // inactive — doesn't count toward active-owner total
      },
    });

    // Activating this owner is fine (would yield 2 active owners). But we
    // want to test the lock: try to demote the SOLE active owner instead.
    // The actor (`lock.userId`) is the only active owner; we can't edit them
    // (cannot_edit_self). So set up a DIFFERENT scenario: target is the only
    // active owner, but a different user does the patch. We'll just make the
    // existing `lock` owner the target's editor by minting a token for
    // `target` (currently inactive) and using lock owner as target.
    //
    // Simpler path: seed two owners, mint lockToken for owner2, demote owner1.
    await adminPrisma.user.update({
      where: { id: target.id },
      data: { is_active: true },
    });
    // Now both are active. Use ownerTokenA-equivalent — mint a token for the
    // active second owner and try to demote the first.
    const ownerTwoToken = (
      await tokens.mintPair({ userId: target.id, tenantId: lock.tenantId, role: "owner" })
    ).access_token;

    // First, deactivate `lock.userId` via owner2 token — this leaves owner2
    // as the only active owner. Then try to demote owner2 from a NEW third
    // user — but creating that third user complicates things. Easier:
    // deactivate owner1 first (this should succeed because owner2 is active).
    const deact = await request(booted.http)
      .patch(`/v1/users/${lock.userId}`)
      .set("Authorization", `Bearer ${ownerTwoToken}`)
      .send({ is_active: false });
    expect(deact.status).toBe(200);

    // Now owner2 is the sole active owner. Try to demote them via owner1's
    // (now-inactive) token — but inactive users can't auth. Use a NEW owner
    // token. Use `lockToken` (owner1) — owner1 is inactive now so JWT auth
    // would still work for one round since we don't re-check is_active per
    // request in the tenant guard for this slice. Actually the simpler
    // option: seed THREE owners, deactivate one, then have one of the
    // remaining demote the last active. Let's just call PATCH with
    // `lockToken` (owner1, now inactive) — the access token still verifies.
    const demote = await request(booted.http)
      .patch(`/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${lockToken}`)
      .send({ role: "manager", branch_id: null });
    // Even with branch_id present this would fail manager_requires_branch;
    // we want to specifically hit last_owner_lock. Demote to accountant
    // (which doesn't require a branch).
    if (demote.status !== 409) {
      // Re-issue with accountant role; the previous call may have failed for
      // manager_requires_branch first.
      const demote2 = await request(booted.http)
        .patch(`/v1/users/${target.id}`)
        .set("Authorization", `Bearer ${lockToken}`)
        .send({ role: "accountant" });
      expect(demote2.status).toBe(409);
      expect(demote2.body.code).toBe("last_owner_lock");
    } else {
      expect(demote.body.code).toBe("last_owner_lock");
    }
  });

  // ─── 9. PATCH unknown user → 422 ──────────────────────────────────

  it("PATCH unknown user returns 422 unknown_user", async () => {
    const res = await request(booted.http)
      .patch(`/v1/users/${randomUUID()}`)
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .send({ is_active: false });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_user");
  });

  // ─── 10. RLS canary: tenant B cannot see tenant A's users ─────────

  it("tenant B's token cannot see tenant A's invited user", async () => {
    const email = `crossover-${randomUUID().slice(0, 6)}@example.test`;
    const create = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ email, name: "Crossover", role: "cashier" });
    expect(create.status).toBe(201);
    const createdId = create.body.id as string;

    const list = await request(booted.http)
      .get("/v1/users")
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(createdId);

    // PATCH should 422 unknown_user (RLS-hidden row reads as missing).
    const patch = await request(booted.http)
      .patch(`/v1/users/${createdId}`)
      .set("Authorization", `Bearer ${ownerTokenB}`)
      .send({ is_active: false });
    expect(patch.status).toBe(422);
    expect(patch.body.code).toBe("unknown_user");
  });

  // ─── 11. resend-invite rotates token + sends new .eml ─────────────

  it("resend-invite rotates the password_reset hash and sends a new email", async () => {
    const email = `resend-${randomUUID().slice(0, 6)}@example.test`;
    const create = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ email, name: "Re-invite Me", role: "cashier" });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    await new Promise((r) => setTimeout(r, 50));
    const beforeRow = await adminPrisma.user.findUnique({
      where: { id },
      select: { password_reset_token_hash: true },
    });
    const prevHash = beforeRow?.password_reset_token_hash;
    expect(prevHash).toBeTruthy();

    const sanitized = email.replace(/[^a-z0-9._@-]/gi, "_");
    const beforeMatching = (await fs.readdir(EMAIL_DIR)).filter(
      (f) => f.endsWith(".eml") && f.includes(sanitized),
    ).length;

    const res = await request(booted.http)
      .post(`/v1/users/${id}/resend-invite`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.expires_at).toEqual(expect.any(String));

    const afterRow = await adminPrisma.user.findUnique({
      where: { id },
      select: { password_reset_token_hash: true },
    });
    expect(afterRow?.password_reset_token_hash).toBeTruthy();
    expect(afterRow?.password_reset_token_hash).not.toBe(prevHash);

    await new Promise((r) => setTimeout(r, 120));
    const afterMatching = (await fs.readdir(EMAIL_DIR)).filter(
      (f) => f.endsWith(".eml") && f.includes(sanitized),
    ).length;
    expect(afterMatching).toBeGreaterThan(beforeMatching);

    const audit = await readAuditLog(tenantA.tenantId, "user_invite_resent");
    expect(audit.length).toBeGreaterThan(0);
  });

  // ─── 12. branch shown on list rows ────────────────────────────────

  it("list rows include branch_code + branch_name_i18n when branch_id is set", async () => {
    const email = `withbranch-${randomUUID().slice(0, 6)}@example.test`;
    const create = await request(booted.http)
      .post("/v1/users/invite")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        email,
        name: "Branch Boss",
        role: "manager",
        branch_id: branchAId,
      });
    expect(create.status).toBe(201);
    expect(create.body.branch_id).toBe(branchAId);
    expect(create.body.branch_name_i18n).toEqual({ en: "Main Branch", ar: "الفرع الرئيسي" });

    const list = await request(booted.http)
      .get(`/v1/users?search=${encodeURIComponent(email)}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    const row = (list.body.items as Array<{ email: string; branch_code: string | null }>).find(
      (r) => r.email === email,
    );
    expect(row).toBeDefined();
    expect(row!.branch_code).toMatch(/^BR-/);
  });

  // ─── owner-initiated password reset (#7) ───────────────────────────

  it("owner can initiate a password reset for a staff member — token stamped, .eml lands, audit row written", async () => {
    const filesBefore: string[] = await fs.readdir(EMAIL_DIR).catch(() => [] as string[]);

    const res = await request(booted.http)
      .post(`/v1/users/${cashierIdA}/reset-password`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cashierIdA);
    expect(typeof res.body.expires_at).toBe("string");

    // Token + expiry now stamped on the user row.
    const after = await adminPrisma.user.findUnique({ where: { id: cashierIdA } });
    expect(after?.password_reset_token_hash).toBeTruthy();
    expect(after?.password_reset_expires_at).toBeTruthy();

    // The password_reset .eml should land on disk for the cashier's address.
    let candidates: string[] = [];
    const localPart = after!.email.split("@")[0]!;
    for (let i = 0; i < 30; i++) {
      const files = await fs.readdir(EMAIL_DIR).catch(() => []);
      candidates = files
        .filter((f) => !filesBefore.includes(f))
        .filter((f) => f.includes(localPart));
      if (candidates.length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    let resetContents: string | null = null;
    for (const f of candidates) {
      const c = await fs.readFile(path.join(EMAIL_DIR, f), "utf8");
      if (
        c.includes("X-Madar-Template: password_reset\n") ||
        c.includes("X-Madar-Template: password_reset\r\n")
      ) {
        resetContents = c;
        break;
      }
    }
    expect(resetContents).not.toBeNull();

    const audit = await readAuditLog(tenantA.tenantId, "user_password_reset_initiated");
    expect(audit.length).toBeGreaterThan(0);
    const latest = audit[0]!;
    expect((latest.after as Record<string, unknown>).user_id).toBe(cashierIdA);
  });

  it("owner trying to reset their own password gets 400 cannot_reset_self", async () => {
    const res = await request(booted.http)
      .post(`/v1/users/${tenantA.userId}/reset-password`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("cannot_reset_self");
  });

  it("admin impersonating an owner cannot initiate a password reset (403 forbidden_during_impersonation)", async () => {
    const imper = await tokens.mintImpersonationAccess({
      tenantId: tenantA.tenantId,
      targetUserId: tenantA.userId,
      targetRole: "owner",
      impersonatorId: randomUUID(),
      impersonatorEmail: "admin@platform.test",
    });
    const res = await request(booted.http)
      .post(`/v1/users/${cashierIdA}/reset-password`)
      .set("Authorization", `Bearer ${imper.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_during_impersonation");
  });
});
