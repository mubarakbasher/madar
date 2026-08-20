import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

describe("Receivables (/v1/customers/:id/receivables)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "recv" });

    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const manager = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `mgr-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Manager",
        role: "manager",
        branch_id: t.branchId,
        locale: "en",
      },
    });
    managerToken = (
      await tokens.mintPair({ userId: manager.id, tenantId: t.tenantId, role: "manager" })
    ).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        branch_id: t.branchId,
        locale: "en",
      },
    });
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  async function makeCustomer(opts?: { name?: string }) {
    return adminPrisma.customer.create({
      data: {
        tenant_id: t.tenantId,
        name: opts?.name ?? `Credit Customer ${randomUUID().slice(0, 6)}`,
      },
    });
  }

  function postSale(body: Record<string, unknown>, token: string = ownerToken) {
    return request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  async function makePartialSale(customerId: string, productIndex = 0) {
    const product = t.products[productIndex]!;
    const total = Number(product.price_cents);
    const cashAmount = Math.floor(total / 2);
    const onAccount = total - cashAmount;
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: customerId,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [{ method: "cash", amount_cents: cashAmount, cash_tendered_cents: cashAmount }],
      on_account_cents: onAccount,
    });
    expect(res.status).toBe(201);
    return { saleId: res.body.id as string, total, cashAmount, onAccount };
  }

  async function makeFullCreditSale(customerId: string, productIndex = 1) {
    const product = t.products[productIndex]!;
    const total = Number(product.price_cents);
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: customerId,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      on_account_cents: total,
    });
    expect(res.status).toBe(201);
    return { saleId: res.body.id as string, total };
  }

  function postSettle(customerId: string, body: Record<string, unknown>, token = ownerToken) {
    return request(booted.http)
      .post(`/v1/customers/${customerId}/receivables/settle`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  it("cash settlement reduces balance and flips status to paid when fully settled", async () => {
    const customer = await makeCustomer();
    const { saleId, onAccount } = await makePartialSale(customer.id);

    const res = await postSettle(customer.id, {
      sale_id: saleId,
      method: "cash",
      amount_cents: onAccount,
      cash_tendered_cents: onAccount,
    });
    expect(res.status).toBe(200);
    expect(res.body.sale_payment_id).toBeTruthy();
    expect(res.body.balance_minor).toBe("0");

    const sale = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.balance_due_cents).toBe(0n);
    expect(sale!.payment_status).toBe("paid");
  });

  it("partial settlement leaves status partially_paid with reduced balance_due", async () => {
    const customer = await makeCustomer();
    const { saleId, onAccount } = await makePartialSale(customer.id);
    const partial = onAccount > 1 ? onAccount - 1 : onAccount;

    const res = await postSettle(customer.id, {
      sale_id: saleId,
      method: "cash",
      amount_cents: partial,
      cash_tendered_cents: partial,
    });
    expect(res.status).toBe(200);

    const sale = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.balance_due_cents).toBe(BigInt(onAccount - partial));
    expect(sale!.payment_status).toBe("partially_paid");
  });

  it("settling an unpaid (full-credit) sale moves it to partially_paid", async () => {
    const customer = await makeCustomer();
    const { saleId, total } = await makeFullCreditSale(customer.id);
    const partial = Math.floor(total / 2);

    const res = await postSettle(customer.id, {
      sale_id: saleId,
      method: "cash",
      amount_cents: partial,
      cash_tendered_cents: partial,
    });
    expect(res.status).toBe(200);

    const sale = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.payment_status).toBe("partially_paid");
    expect(sale!.balance_due_cents).toBe(BigInt(total - partial));
  });

  it("rejects amount above the sale's balance_due → amount_exceeds_balance", async () => {
    const customer = await makeCustomer();
    const { saleId, onAccount } = await makePartialSale(customer.id);

    const res = await postSettle(customer.id, {
      sale_id: saleId,
      method: "cash",
      amount_cents: onAccount + 1000,
      cash_tendered_cents: onAccount + 1000,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("amount_exceeds_balance");
  });

  it("rejects settle on a sale not belonging to the customer → customer_mismatch", async () => {
    const customer = await makeCustomer();
    const otherCustomer = await makeCustomer();
    const { saleId, onAccount } = await makePartialSale(customer.id);

    const res = await postSettle(otherCustomer.id, {
      sale_id: saleId,
      method: "cash",
      amount_cents: onAccount,
      cash_tendered_cents: onAccount,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("customer_mismatch");
  });

  it("cashier role gets 403 forbidden_role", async () => {
    const customer = await makeCustomer();
    const { saleId, onAccount } = await makePartialSale(customer.id);

    const res = await postSettle(
      customer.id,
      { sale_id: saleId, method: "cash", amount_cents: onAccount, cash_tendered_cents: onAccount },
      cashierToken,
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("writes a negative receivable ledger row referencing the sale_payment", async () => {
    const customer = await makeCustomer();
    const { saleId, onAccount } = await makePartialSale(customer.id);

    const res = await postSettle(customer.id, {
      sale_id: saleId,
      method: "cash",
      amount_cents: onAccount,
      cash_tendered_cents: onAccount,
    });
    expect(res.status).toBe(200);

    const rows = await adminPrisma.customerReceivableLedger.findMany({
      where: { tenant_id: t.tenantId, customer_id: customer.id, reference_table: "sale_payment" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount_minor).toBe(-BigInt(onAccount));
    expect(rows[0]!.reference_id).toBe(res.body.sale_payment_id);

    const auditRows = await readAuditLog(t.tenantId, "receivable_settled");
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it("summary lists open sales and current balance", async () => {
    const customer = await makeCustomer();
    const { saleId, onAccount } = await makePartialSale(customer.id);

    const res = await request(booted.http)
      .get(`/v1/customers/${customer.id}/receivables`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.customer_id).toBe(customer.id);
    expect(res.body.balance_minor).toBe(String(onAccount));
    expect(res.body.open_sales).toHaveLength(1);
    expect(res.body.open_sales[0].sale_id).toBe(saleId);
    expect(res.body.open_sales[0].balance_due_cents).toBe(String(onAccount));

    const managerRes = await request(booted.http)
      .get(`/v1/customers/${customer.id}/receivables`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(managerRes.status).toBe(200);

    const cashierRes = await request(booted.http)
      .get(`/v1/customers/${customer.id}/receivables`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(cashierRes.status).toBe(403);
  });
});
