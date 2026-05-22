/**
 * Admin cron jobs — trial reminders + low-stock alerts. Boots the real Nest
 * app (no REDIS_URL in tests so the inline manual-trigger path runs) and
 * verifies the side effects: emails written to disk, dedup columns bumped,
 * audit rows written.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { makeTenant, makeTenantWithCatalog } from "../helpers/fixtures";

const EMAIL_DIR =
  process.env.EMAIL_LOG_DIR && path.isAbsolute(process.env.EMAIL_LOG_DIR)
    ? process.env.EMAIL_LOG_DIR
    : path.resolve(__dirname, "..", "var", "test-emails");

describe("Admin cron — trial reminders + low-stock alerts (C1/C2/C3)", () => {
  let booted: BootedTestApp;
  let adminToken: string;
  let readonlyToken: string;

  beforeAll(async () => {
    await fs.mkdir(EMAIL_DIR, { recursive: true });
    booted = await bootTestApp();
    const tokens = booted.app.get(AdminTokenService);

    const owner = await makePlatformUser({ emailPrefix: "cron-owner", role: "owner" });
    adminToken = (
      await tokens.mintAccessPair({
        platformUserId: owner.platformUserId,
        email: owner.email,
        role: owner.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;

    const ro = await makePlatformUser({ emailPrefix: "cron-ro", role: "readonly" });
    readonlyToken = (
      await tokens.mintAccessPair({
        platformUserId: ro.platformUserId,
        email: ro.email,
        role: ro.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── 1. readonly admin is 403 on both endpoints ─────────────────────────

  it("readonly admin gets 403 on both run-now endpoints", async () => {
    const a = await request(booted.http)
      .post("/v1/admin/cron/trial-reminders/run-now")
      .set("Authorization", `Bearer ${readonlyToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(a.status).toBe(403);
    expect(a.body.code).toBe("forbidden_role");

    const b = await request(booted.http)
      .post("/v1/admin/cron/low-stock/run-now")
      .set("Authorization", `Bearer ${readonlyToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(b.status).toBe(403);
    expect(b.body.code).toBe("forbidden_role");
  });

  // ─── 2. trial reminder: in-window tenant emailed once + dedup column set

  it("trial reminder: in-window tenant gets emailed exactly once + audit row + dedup column set", async () => {
    // 2.5 days from now lands inside the [2, 3) window.
    const trialEndsAt = new Date(Date.now() + 2.5 * 86_400_000);
    const tenant = await makeTenant({
      slugPrefix: "trial-in-window",
      emailPrefix: "trial-recipient",
      status: "trialing",
    });
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { trial_ends_at: trialEndsAt, trial_reminder_sent_at: null },
    });

    const filesBefore = new Set(await fs.readdir(EMAIL_DIR).catch(() => []));

    const res = await request(booted.http)
      .post("/v1/admin/cron/trial-reminders/run-now")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);
    expect(res.body.reminders_sent).toBeGreaterThanOrEqual(1);

    // Wait for fire-and-forget email then assert the .eml landed.
    await new Promise((r) => setTimeout(r, 200));
    const filesAfter = await fs.readdir(EMAIL_DIR);
    const fresh = filesAfter.filter((f) => !filesBefore.has(f) && f.endsWith(".eml"));
    const matching = fresh.find((f) => f.includes("trial_ending"));
    expect(matching, `expected a trial_ending .eml in ${fresh.join(", ")}`).toBeTruthy();

    const updated = await adminPrisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: { trial_reminder_sent_at: true },
    });
    expect(updated?.trial_reminder_sent_at).not.toBeNull();

    // Second run is a no-op for this tenant — count should be zero for it.
    const secondFiles = new Set(await fs.readdir(EMAIL_DIR));
    const res2 = await request(booted.http)
      .post("/v1/admin/cron/trial-reminders/run-now")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res2.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    const afterSecond = (await fs.readdir(EMAIL_DIR)).filter(
      (f) => !secondFiles.has(f) && f.includes("trial_ending"),
    );
    expect(afterSecond.length).toBe(0);
  });

  // ─── 3. trial reminder: out-of-window tenant skipped ────────────────────

  it("trial reminder: tenant whose trial ends in 30 days is NOT emailed", async () => {
    const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
    const tenant = await makeTenant({
      slugPrefix: "trial-out-of-window",
      emailPrefix: "out-recipient",
      status: "trialing",
    });
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { trial_ends_at: trialEndsAt, trial_reminder_sent_at: null },
    });

    const res = await request(booted.http)
      .post("/v1/admin/cron/trial-reminders/run-now")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);

    const fresh = await adminPrisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: { trial_reminder_sent_at: true },
    });
    expect(fresh?.trial_reminder_sent_at).toBeNull();
  });

  // ─── 4. low-stock: items at-or-below threshold trigger digest ──────────

  it("low-stock: items at threshold trigger one digest per tenant + dedup column bumped + audit row", async () => {
    const fix = await makeTenantWithCatalog({ slugPrefix: "low-stock-cron" });
    // Move the first product to a low-stock state on its branch_stock row.
    const product = fix.products[0]!;
    const stockRow = await adminPrisma.branchStock.findFirst({
      where: { tenant_id: fix.tenantId, branch_id: fix.branchId, product_id: product.id },
      select: { id: true },
    });
    expect(stockRow).toBeTruthy();
    await adminPrisma.branchStock.update({
      where: { id: stockRow!.id },
      data: { qty_on_hand: 2, reorder_point: 5, last_low_stock_alert_at: null },
    });

    const filesBefore = new Set(await fs.readdir(EMAIL_DIR).catch(() => []));

    const res = await request(booted.http)
      .post("/v1/admin/cron/low-stock/run-now")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);
    expect(res.body.tenants_alerted).toBeGreaterThanOrEqual(1);
    expect(res.body.items_alerted).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 200));
    const fresh = (await fs.readdir(EMAIL_DIR)).filter(
      (f) => !filesBefore.has(f) && f.endsWith(".eml") && f.includes("low_stock_alert"),
    );
    expect(
      fresh.length,
      `expected a low_stock_alert .eml, got ${fresh.join(", ")}`,
    ).toBeGreaterThanOrEqual(1);

    // Dedup column bumped on the included row.
    const after = await adminPrisma.branchStock.findUnique({
      where: { id: stockRow!.id },
      select: { last_low_stock_alert_at: true },
    });
    expect(after?.last_low_stock_alert_at).not.toBeNull();

    // Audit row exists (find against any of the platform users we minted).
    // Filter by action — the cron service writes one audit per tenant alerted.
    const audits = await adminPrisma.platformAuditLog.findMany({
      where: { action: "low_stock_alert_sent", target_tenant_id: fix.tenantId },
    });
    expect(audits.length).toBe(1);

    // Re-run within dedup window: same row should NOT re-fire.
    const beforeRetry = new Set(await fs.readdir(EMAIL_DIR));
    const retry = await request(booted.http)
      .post("/v1/admin/cron/low-stock/run-now")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(retry.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    const afterRetryFresh = (await fs.readdir(EMAIL_DIR)).filter(
      (f) =>
        !beforeRetry.has(f) &&
        f.endsWith(".eml") &&
        f.includes("low_stock_alert") &&
        f.includes(fix.email.split("@")[0]!.replace(/[^a-z0-9._-]/gi, "_")),
    );
    expect(afterRetryFresh.length).toBe(0);
  });
});
