import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readStockMovements,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * Credit sales (on_account tender): a sale may be paid partially or entirely
 * "on account" — the customer owes the balance, tracked via
 * customer_receivable_ledger + customers.receivable_balance_minor. Only
 * owners/managers may sell on credit, and a customer must be attached.
 */
describe("POST /v1/sales — on_account (credit sales)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "sale-credit" });

    const ownerPair = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    ownerToken = ownerPair.access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 8)}@example.test`,
        password_hash: "unused-in-token-tests",
        name: "On-account Cashier",
        role: "cashier",
        branch_id: t.branchId,
        locale: "en",
        is_active: true,
      },
    });
    const cashierPair = await tokens.mintPair({
      userId: cashier.id,
      tenantId: t.tenantId,
      role: "cashier",
    });
    cashierToken = cashierPair.access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  function postSale(body: Record<string, unknown>, token: string = ownerToken) {
    return request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  async function makeCustomer(opts?: {
    receivableBalance?: bigint;
    receivableCurrency?: string;
  }) {
    return adminPrisma.customer.create({
      data: {
        tenant_id: t.tenantId,
        name: "Credit Customer",
        receivable_balance_minor: opts?.receivableBalance ?? 0n,
        receivable_currency_code: opts?.receivableCurrency ?? null,
      },
    });
  }

  it("completes a partial-payment sale: cash slice + on_account", async () => {
    const product = t.products[0]!; // 3500
    const total = Number(product.price_cents);
    const cashAmount = 1400;
    const onAccount = total - cashAmount; // 2100
    const customer = await makeCustomer();
    const body = {
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [{ method: "cash", amount_cents: cashAmount, cash_tendered_cents: cashAmount }],
      on_account_cents: onAccount,
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);
    expect(res.body.payment_status).toBe("partially_paid");
    expect(res.body.balance_due_cents).toBe(String(onAccount));

    const ledger = await adminPrisma.customerReceivableLedger.findMany({
      where: { customer_id: customer.id },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.amount_minor).toBe(BigInt(onAccount));
    expect(ledger[0]!.balance_after_minor).toBe(BigInt(onAccount));
    expect(ledger[0]!.reference_table).toBe("sale");
    expect(ledger[0]!.reference_id).toBe(res.body.id);

    const cust = await adminPrisma.customer.findUnique({ where: { id: customer.id } });
    expect(cust!.receivable_balance_minor).toBe(BigInt(onAccount));
  });

  it("completes a full-credit sale: no payments, all on account → unpaid", async () => {
    const product = t.products[1]!; // 7000
    const total = Number(product.price_cents);
    const customer = await makeCustomer();
    const body = {
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      on_account_cents: total,
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);
    expect(res.body.payment_status).toBe("unpaid");
    expect(res.body.balance_due_cents).toBe(String(total));
    expect(res.body.payments).toEqual([]);
    expect(res.body.payment_method).toBe("on_account");
  });

  it("rejects on_account without a customer → 400 credit_requires_customer", async () => {
    const product = t.products[2]!; // 4500
    const total = Number(product.price_cents);
    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      on_account_cents: total,
    };

    const res = await postSale(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "credit_requires_customer" });
  });

  it("rejects on_account from a cashier → 403 credit_sale_not_permitted", async () => {
    const product = t.products[0]!;
    const total = Number(product.price_cents);
    const customer = await makeCustomer();
    const body = {
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      on_account_cents: total,
    };

    const res = await postSale(body, cashierToken);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "credit_sale_not_permitted" });
  });

  it("rejects when payments + on_account != total → 400 split_total_mismatch", async () => {
    const product = t.products[0]!; // 3500
    const customer = await makeCustomer();
    const body = {
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [{ method: "cash", amount_cents: 1000, cash_tendered_cents: 1000 }],
      on_account_cents: 2000, // 1000 + 2000 != 3500
    };

    const res = await postSale(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "split_total_mismatch" });
  });

  it("rejects currency mismatch with existing receivable currency → 400 currency_mismatch", async () => {
    const product = t.products[1]!; // 7000
    const total = Number(product.price_cents);
    const customer = await makeCustomer({
      receivableBalance: 500n,
      receivableCurrency: "EGP",
    });
    const body = {
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      on_account_cents: total,
    };

    const res = await postSale(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "currency_mismatch" });
  });

  it("still commits inventory on a full-credit sale", async () => {
    const product = t.products[2]!; // 4500
    const total = Number(product.price_cents);
    const customer = await makeCustomer();
    const body = {
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      on_account_cents: total,
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);

    const movements = await readStockMovements(t.tenantId, product.id);
    const saleMovement = movements.find((m) => m.kind === "sale");
    expect(saleMovement).toBeDefined();
    expect(saleMovement!.qty_delta).toBe(-1);
  });
});
