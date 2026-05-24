import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser } from "../helpers/admin-fixtures";
import { makeTenant, seedStarterPlan } from "../helpers/fixtures";
import { resetEnvCache } from "../../src/env";

const EMAIL_DIR = path.resolve(__dirname, "..", "var", "test-emails-billing-tick");

describe("Billing tick email side-effects", () => {
  let booted: BootedTestApp;
  let adminToken: string;

  beforeAll(async () => {
    await fs.rm(EMAIL_DIR, { recursive: true, force: true });
    await fs.mkdir(EMAIL_DIR, { recursive: true });
    process.env.EMAIL_LOG_DIR = EMAIL_DIR;
    resetEnvCache();
    booted = await bootTestApp();
    const tokens = booted.app.get(AdminTokenService);
    await seedStarterPlan();

    const owner = await makePlatformUser({ emailPrefix: "tick-email-owner", role: "owner" });
    adminToken = (
      await tokens.mintAccessPair({
        platformUserId: owner.platformUserId,
        email: owner.email,
        role: owner.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("invoice_issued email fires when trial-end invoice is bootstrapped", async () => {
    const tenant = await makeTenant({
      slugPrefix: "tick-trial-email",
      emailPrefix: "tick-trial-rcpt",
      status: "trialing",
    });
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { trial_ends_at: new Date(Date.now() - 86_400_000) },
    });

    const filesBefore = new Set(await fs.readdir(EMAIL_DIR).catch(() => []));

    const res = await request(booted.http)
      .post("/v1/admin/billing/tick")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);
    expect(res.body.trial_invoices_created).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 300));
    const filesAfter = await fs.readdir(EMAIL_DIR);
    const fresh = filesAfter.filter((f) => !filesBefore.has(f) && f.endsWith(".eml"));
    const invoiceEmail = fresh.find((f) => f.includes("invoice_issued"));
    expect(invoiceEmail, `expected invoice_issued .eml in ${fresh.join(", ")}`).toBeTruthy();

    if (invoiceEmail) {
      const body = await fs.readFile(path.join(EMAIL_DIR, invoiceEmail), "utf8");
      expect(body).toContain("INV-");
    }
  });

  it("suspended email fires when tenant transitions to suspended", async () => {
    const tenant = await makeTenant({
      slugPrefix: "tick-suspend-email",
      emailPrefix: "tick-suspend-rcpt",
      status: "active",
    });
    const pastDue = new Date(Date.now() - 10 * 86_400_000);
    await adminPrisma.subscriptionInvoice.create({
      data: {
        tenant_id: tenant.tenantId,
        plan_id: tenant.planId,
        period_start: new Date(pastDue.getTime() - 30 * 86_400_000),
        period_end: pastDue,
        due_date: pastDue,
        amount_cents: 4900n,
        currency_code: "USD",
        status: "overdue",
        reference_code: `INV-${randomUUID().slice(0, 8)}`,
      },
    });

    const filesBefore = new Set(await fs.readdir(EMAIL_DIR).catch(() => []));

    const res = await request(booted.http)
      .post("/v1/admin/billing/tick")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);
    expect(res.body.tenants_moved_to_suspended).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 300));
    const filesAfter = await fs.readdir(EMAIL_DIR);
    const fresh = filesAfter.filter((f) => !filesBefore.has(f) && f.endsWith(".eml"));
    const suspendedEmail = fresh.find((f) => f.includes("suspended"));
    expect(suspendedEmail, `expected suspended .eml in ${fresh.join(", ")}`).toBeTruthy();

    const updated = await adminPrisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: { status: true },
    });
    expect(updated?.status).toBe("suspended");
  });

  it("billing tick succeeds even when tenant has no active owner (no email, no crash)", async () => {
    const tenant = await makeTenant({
      slugPrefix: "tick-no-owner",
      emailPrefix: "tick-no-owner-user",
      status: "trialing",
    });
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { trial_ends_at: new Date(Date.now() - 86_400_000) },
    });
    await adminPrisma.user.updateMany({
      where: { tenant_id: tenant.tenantId },
      data: { is_active: false },
    });

    const res = await request(booted.http)
      .post("/v1/admin/billing/tick")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);
    expect(res.body.errors.length).toBe(0);
  });
});
