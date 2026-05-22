import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeSubscriptionInvoice,
  makePlatformBankAccount,
  makeTenant,
  seedStarterPlan,
  type TenantFixture,
} from "../helpers/fixtures";
import { seedAllPlans } from "../helpers/admin-fixtures";

describe("Tenant billing endpoints", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let tenant: TenantFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    await seedAllPlans();
    await seedStarterPlan();
    tenant = await makeTenant({ slugPrefix: "billing-test", status: "active" });
    const pair = await tokens.mintPair({
      userId: tenant.userId,
      tenantId: tenant.tenantId,
      role: "owner",
    });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("GET /v1/plans returns active plans", async () => {
    const res = await request(booted.http)
      .get("/v1/plans")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0]).toHaveProperty("code");
    expect(res.body.items[0]).toHaveProperty("monthly_price_cents");
    expect(typeof res.body.items[0].monthly_price_cents).toBe("string");
  });

  it("GET /v1/subscription returns tenant + plan + usage + next_invoice", async () => {
    await makeSubscriptionInvoice(tenant.tenantId, tenant.planId, {
      status: "awaiting_payment",
      amountCents: 4900n,
    });
    const res = await request(booted.http)
      .get("/v1/subscription")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tenant.id).toBe(tenant.tenantId);
    expect(res.body.plan).toHaveProperty("code");
    expect(res.body.usage).toHaveProperty("transactions_this_period");
    expect(res.body.next_invoice).not.toBeNull();
    expect(res.body.next_invoice.status).toBe("awaiting_payment");
  });

  it("GET /v1/subscription-invoices lists tenant's invoices only", async () => {
    const otherTenant = await makeTenant({ slugPrefix: "billing-other", status: "active" });
    await makeSubscriptionInvoice(otherTenant.tenantId, otherTenant.planId, {
      status: "awaiting_payment",
    });
    const res = await request(booted.http)
      .get("/v1/subscription-invoices")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    for (const inv of res.body.items) {
      const row = await adminPrisma.subscriptionInvoice.findUnique({ where: { id: inv.id } });
      expect(row?.tenant_id).toBe(tenant.tenantId);
    }
  });

  it("GET /v1/subscription-invoices?status=paid filters correctly", async () => {
    await makeSubscriptionInvoice(tenant.tenantId, tenant.planId, { status: "paid" });
    const res = await request(booted.http)
      .get("/v1/subscription-invoices?status=paid")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const inv of res.body.items) expect(inv.status).toBe("paid");
  });

  it("GET /v1/subscription-invoices/:id returns invoice + proofs[]", async () => {
    const inv = await makeSubscriptionInvoice(tenant.tenantId, tenant.planId, {
      status: "awaiting_payment",
    });
    const res = await request(booted.http)
      .get(`/v1/subscription-invoices/${inv.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(inv.id);
    expect(Array.isArray(res.body.proofs)).toBe(true);
  });

  it("GET /v1/subscription-invoices/:id with unknown id returns 404", async () => {
    const res = await request(booted.http)
      .get(`/v1/subscription-invoices/${randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("invoice_not_found");
  });

  it("GET /v1/platform-bank-accounts filters by currency", async () => {
    await makePlatformBankAccount({ currencyCode: "USD" });
    const res = await request(booted.http)
      .get("/v1/platform-bank-accounts?currency=USD")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const b of res.body.items) {
      expect(b.currency_code).toBe("USD");
      expect(b).toHaveProperty("account_number_last4");
      // Never leak full account numbers.
      expect(b).not.toHaveProperty("account_number_encrypted");
    }
  });

  it("billing endpoints reject anonymous calls with 401", async () => {
    const res = await request(booted.http).get("/v1/subscription");
    expect(res.status).toBe(401);
  });
});
