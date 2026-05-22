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

describe("GET /v1/admin/dashboard/activity", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  async function adminToken() {
    const a = await makePlatformUser({ emailPrefix: "activity" });
    const tokens = booted.app.get(AdminTokenService);
    const pair = await tokens.mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    return pair.access_token;
  }

  it("returns an empty list when no tenants exist", async () => {
    await isolateTenantUniverse([]);
    await adminPrisma.paymentProof.deleteMany({});
    const token = await adminToken();
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/activity")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("returns tenant_signup + verification_pending + sale_completed mixed and sorted desc", async () => {
    await isolateTenantUniverse([]);
    await adminPrisma.paymentProof.deleteMany({});

    const [t1, t2] = await makeMultipleTenants([
      { status: "active", planCode: "growth", country: "EG" },
      { status: "active", planCode: "starter", country: "EG" },
    ]);

    // Pending proof — created now → top of feed alongside the signups.
    await adminPrisma.paymentProof.create({
      data: {
        tenant_id: t1!.id,
        context: "sale",
        reference_id: t1!.id,
        amount_cents: 7500n,
        currency_code: "USD",
        bank_account_kind: "tenant",
        bank_account_id: t1!.id,
        payer_name: "Test payer",
        transfer_date: new Date(),
        receipt_image_url: "test://x.jpg",
        status: "pending",
      },
    });

    // Audit log row for a sale_completed event on t2.
    await adminPrisma.auditLog.create({
      data: {
        tenant_id: t2!.id,
        action: "sale_completed",
        entity: "sale",
        entity_id: t2!.id,
        after: { code: "TX-AAAAAA", total_cents: "12345", line_count: 1 },
      },
    });

    const token = await adminToken();
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/activity")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const items = res.body.items as Array<{ kind: string; tenant_id: string; text: string }>;
    expect(items.length).toBeGreaterThanOrEqual(4);

    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain("tenant_signup");
    expect(kinds).toContain("sale_completed");
    expect(kinds).toContain("verification_pending");

    // Sorted DESC by occurred_at — newest first.
    for (let i = 0; i < items.length - 1; i++) {
      expect(
        new Date((items[i] as unknown as { occurred_at: string }).occurred_at).getTime(),
      ).toBeGreaterThanOrEqual(
        new Date((items[i + 1] as unknown as { occurred_at: string }).occurred_at).getTime(),
      );
    }

    // sale_completed activity should include the sale code in its text.
    const saleItem = items.find((i) => i.kind === "sale_completed");
    expect(saleItem!.text).toContain("TX-AAAAAA");
  });

  it("respects the limit query param", async () => {
    await isolateTenantUniverse([]);
    await adminPrisma.paymentProof.deleteMany({});
    await makeMultipleTenants(
      Array.from({ length: 12 }, () => ({ status: "active" as const, planCode: "starter" })),
    );
    const token = await adminToken();
    const res = await request(booted.http)
      .get("/v1/admin/dashboard/activity?limit=5")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(5);
  });
});
