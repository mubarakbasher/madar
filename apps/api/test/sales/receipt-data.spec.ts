import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("GET /v1/sales/:id/receipt-data", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;
  let saleId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "receipt-test" });
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;

    const target = t.products[0]!;
    const saleRes = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: t.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: target.id, qty: 2, line_discount_cents: 0, note: null }],
        cash_tendered_cents: Number(target.price_cents) * 2,
      });
    saleId = saleRes.body.id;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy: returns sale + tenant + branch + cashier", async () => {
    const res = await request(booted.http)
      .get(`/v1/sales/${saleId}/receipt-data`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sale.id).toBe(saleId);
    expect(res.body.tenant.name).toMatch(/Test Shop/);
    expect(res.body.branch).not.toBeNull();
    expect(res.body.branch.code).toMatch(/^BR-/);
    expect(res.body.cashier).not.toBeNull();
    expect(res.body.cashier.name).toBe("Test Owner");
    // Invoice-header fields surface for the A4 layout (null when unset).
    expect(res.body.tenant).toHaveProperty("legal_name");
    expect(res.body.tenant).toHaveProperty("tax_registration_number");
    // Cash sale → bank_account is null
    expect(res.body.bank_account).toBeNull();
  });

  it("bank_transfer sale exposes default tenant_bank_account", async () => {
    await adminPrisma.tenantBankAccount.create({
      data: {
        tenant_id: t.tenantId,
        name_i18n: { en: "Main", ar: "الرئيسي" },
        bank_name: "Test Bank",
        account_holder: "Test Holder",
        account_number_last4: "0001",
        account_number_encrypted: "encrypted-fake",
        currency_code: "USD",
        is_default: true,
      },
    });
    const target = t.products[1]!;
    const sale = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: t.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "bank_transfer",
        client_uuid: randomUUID(),
        client_sequence: 2,
        lines: [{ product_id: target.id, qty: 1, line_discount_cents: 0, note: null }],
      });
    expect(sale.status).toBe(201);

    const res = await request(booted.http)
      .get(`/v1/sales/${sale.body.id}/receipt-data`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.bank_account).not.toBeNull();
    expect(res.body.bank_account.account_number_last4).toBe("0001");
    expect(res.body.bank_account).not.toHaveProperty("account_number_encrypted");
  });

  it("unknown sale id returns 404", async () => {
    const res = await request(booted.http)
      .get(`/v1/sales/${randomUUID()}/receipt-data`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it("RLS: tenant B cannot read tenant A's receipt (404)", async () => {
    const tB = await makeTenantWithCatalog({ slugPrefix: "receipt-rls-b" });
    const tBPair = await tokens.mintPair({
      userId: tB.userId,
      tenantId: tB.tenantId,
      role: "owner",
    });
    const res = await request(booted.http)
      .get(`/v1/sales/${saleId}/receipt-data`)
      .set("Authorization", `Bearer ${tBPair.access_token}`);
    expect(res.status).toBe(404);
  });
});
