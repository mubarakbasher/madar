import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import {
  isolateTenantUniverse,
  makeMultipleTenants,
  makePlatformUser,
  type SimpleTenantFixture,
} from "../helpers/admin-fixtures";

describe("GET /v1/admin/tenants — happy path + per-tenant counts", () => {
  let booted: BootedTestApp;
  let accessToken: string;
  let fixtures: SimpleTenantFixture[];

  beforeAll(async () => {
    booted = await bootTestApp();
    await isolateTenantUniverse([]);
    fixtures = await makeMultipleTenants([
      { status: "active", planCode: "growth", country: "EG" },
      { status: "trialing", planCode: "starter", country: "SA" },
      { status: "suspended", planCode: "business", country: "US" },
    ]);

    // Branch + users + a sale on the first tenant so the counts are non-zero.
    const t0 = fixtures[0]!;
    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: t0.id,
        code: "br-1",
        name_i18n: { en: "Main", ar: "Main" },
        currency_code: "USD",
      },
    });
    await adminPrisma.user.create({
      data: {
        tenant_id: t0.id,
        email: `owner-${t0.slug}@example.test`,
        password_hash: "x",
        name: "Owner",
        role: "owner",
      },
    });
    await adminPrisma.user.create({
      data: {
        tenant_id: t0.id,
        email: `cashier-${t0.slug}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
      },
    });
    await adminPrisma.sale.create({
      data: {
        tenant_id: t0.id,
        branch_id: branch.id,
        code: "TX-T0-AAA1",
        cashier_id: t0.id, // any uuid — RLS bypass via adminPrisma
        subtotal_cents: 1000n,
        total_cents: 1000n,
        currency_code: "USD",
        payment_method: "cash",
        payment_status: "paid",
        client_uuid: "00000000-0000-0000-0000-000000000aaa",
      },
    });

    const a = await makePlatformUser({ emailPrefix: "tenants-happy" });
    const pair = await booted.app.get(AdminTokenService).mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    accessToken = pair.access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("returns all 3 tenants with plan + status + per-tenant counts", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/tenants")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(res.body.total_countries).toBe(3);

    const t0Item = res.body.items.find((i: { id: string }) => i.id === fixtures[0]!.id);
    expect(t0Item).toBeDefined();
    expect(t0Item.branch_count).toBe(1);
    expect(t0Item.user_count).toBe(2);
    expect(t0Item.last_activity_at).toEqual(expect.any(String));
    expect(t0Item.plan).toMatchObject({ code: "growth" });
    expect(t0Item.status).toBe("active");
    expect(t0Item.mrr_cents).toBe("14900"); // growth plan
    expect(t0Item.currency_code).toBe("USD");
    expect(t0Item.country_code).toBe("EG");
  });

  it("suspended tenants report mrr_cents='0' even when their plan is paid", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/tenants")
      .set("Authorization", `Bearer ${accessToken}`);
    const susp = res.body.items.find((i: { status: string }) => i.status === "suspended");
    expect(susp).toBeDefined();
    expect(susp.mrr_cents).toBe("0");
  });

  it("orders results by created_at DESC", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/tenants")
      .set("Authorization", `Bearer ${accessToken}`);
    const times = res.body.items.map((i: { created_at: string }) => new Date(i.created_at).getTime());
    for (let i = 0; i < times.length - 1; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i + 1]);
    }
  });
});
