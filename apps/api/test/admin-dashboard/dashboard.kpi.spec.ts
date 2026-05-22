import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import {
  isolateTenantUniverse,
  makeMultipleTenants,
  makePlatformUser,
} from "../helpers/admin-fixtures";

describe("GET /v1/admin/dashboard/kpi", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  async function adminToken() {
    const a = await makePlatformUser({ emailPrefix: "kpi" });
    const tokens = booted.app.get(AdminTokenService);
    const pair = await tokens.mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    return pair.access_token;
  }

  it("returns zero values when no tenants exist", async () => {
    await isolateTenantUniverse([]);
    await adminPrisma.paymentProof.deleteMany({});
    const token = await adminToken();
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/kpi")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.monthly_recurring.amount_cents).toBe("0");
    expect(res.body.active_tenants).toMatchObject({ count: 0, delta_7d: 0 });
    expect(res.body.trials_ending_soon).toMatchObject({ count: 0, window_days: 7 });
    expect(res.body.pending_verifications).toMatchObject({ count: 0, oldest_days: null });
    expect(res.body.system_health.status).toBe("healthy");
  });

  it("computes MRR + active count + trials ending soon across mixed-status tenants", async () => {
    await isolateTenantUniverse([]);
    await adminPrisma.paymentProof.deleteMany({});

    // 2 active growth, 1 trialing ending in 3 days, 1 trialing ending in 30 days,
    // 1 suspended, 1 grace_period.
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000);
    const inThirtyDays = new Date(Date.now() + 30 * 86_400_000);
    await makeMultipleTenants([
      { status: "active", planCode: "growth", country: "EG" },
      { status: "active", planCode: "growth", country: "EG" },
      { status: "trialing", planCode: "starter", country: "EG", trialEndsAt: inThreeDays },
      { status: "trialing", planCode: "starter", country: "EG", trialEndsAt: inThirtyDays },
      { status: "suspended", planCode: "growth", country: "EG" },
      { status: "grace_period", planCode: "starter", country: "EG" },
    ]);

    const token = await adminToken();
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/kpi")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    // MRR: 2 growth + 2 starter (trialing) + 1 starter (grace) = 2*14900 + 3*4900 = 44500
    expect(res.body.monthly_recurring.amount_cents).toBe("44500");
    expect(res.body.monthly_recurring.currency_code).toBe("USD");
    // active+trialing: 2 + 2 = 4
    expect(res.body.active_tenants.count).toBe(4);
    // trials ending within 7 days: just 1
    expect(res.body.trials_ending_soon.count).toBe(1);
    // No proofs seeded → 0
    expect(res.body.pending_verifications.count).toBe(0);
  });

  it("includes pending payment-proof counts + oldest_days", async () => {
    await isolateTenantUniverse([]);
    await adminPrisma.paymentProof.deleteMany({});
    const [t] = await makeMultipleTenants([{ status: "active", planCode: "growth" }]);

    // Two pending proofs (sale context). Set created_at 10 and 2 days ago so
    // oldest_days = 10.
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await adminPrisma.paymentProof.create({
      data: {
        tenant_id: t!.id,
        context: "sale",
        reference_id: t!.id,
        amount_cents: 5000n,
        currency_code: "USD",
        bank_account_kind: "tenant",
        bank_account_id: t!.id,
        payer_name: "Older proof",
        transfer_date: tenDaysAgo,
        receipt_image_url: "test://1.jpg",
        status: "pending",
        created_at: tenDaysAgo,
      },
    });
    await adminPrisma.paymentProof.create({
      data: {
        tenant_id: t!.id,
        context: "sale",
        reference_id: t!.id,
        amount_cents: 5000n,
        currency_code: "USD",
        bank_account_kind: "tenant",
        bank_account_id: t!.id,
        payer_name: "Newer proof",
        transfer_date: twoDaysAgo,
        receipt_image_url: "test://2.jpg",
        status: "pending",
        created_at: twoDaysAgo,
      },
    });

    const token = await adminToken();
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/kpi")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.pending_verifications.count).toBe(2);
    expect(res.body.pending_verifications.oldest_days).toBeGreaterThanOrEqual(9);
    expect(res.body.pending_verifications.oldest_days).toBeLessThanOrEqual(11);
  });
});
