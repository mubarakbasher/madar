import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  readSaleWithLines,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * Slice 5 — Split tender. These specs are forward-looking: they pass once the
 * controller has refactored sales.service.completeSale() to walk a
 * `payments[]` array and emit one `sale_payments` row per slice. Until then
 * the suite fails by design and serves as the acceptance contract.
 */
describe("POST /v1/sales — split tender", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "sale-split" });
    const pair = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  function postSale(body: Record<string, unknown>) {
    return request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  async function readSalePayments(saleId: string) {
    return adminPrisma.salePayment.findMany({
      where: { sale_id: saleId },
      orderBy: { created_at: "asc" },
    });
  }

  it("happy split: $30 = $10 cash + $20 card → two sale_payments rows, payment_method='split'", async () => {
    // single product priced 3000 cents → one line, qty 1, total 3000
    const product = t.products[0]!;
    const total = Number(product.price_cents); // 3500
    // Use a discount to land on a clean 3000 total ($30).
    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: total - 3000, note: null }],
      payments: [
        { method: "cash", amount_cents: 1000, cash_tendered_cents: 1000 },
        { method: "card", amount_cents: 2000, approval_code: "AUTH12" },
      ],
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);
    expect(res.body.total_cents).toBe("3000");
    expect(res.body.payment_method).toBe("split");
    expect(res.body.payment_status).toBe("paid");

    const stored = await readSaleWithLines(res.body.id);
    expect(stored!.sale.payment_method).toBe("split");

    const payments = await readSalePayments(res.body.id);
    expect(payments).toHaveLength(2);
    const byMethod = new Map(payments.map((p) => [p.method, p]));
    expect(byMethod.get("cash")!.amount_cents).toBe(1000n);
    expect(byMethod.get("card")!.amount_cents).toBe(2000n);
    expect(byMethod.get("card")!.approval_code).toBe("AUTH12");
    expect(byMethod.get("cash")!.cash_tendered_cents).toBe(1000n);
    // Both rows share the same sale_id — they were written inside the same $transaction.
    expect(payments.every((p) => p.sale_id === res.body.id)).toBe(true);
  });

  it("400 split_total_mismatch when sum(amounts) is off by 1 cent", async () => {
    const product = t.products[0]!;
    const total = Number(product.price_cents);
    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: total - 3000, note: null }],
      payments: [
        { method: "cash", amount_cents: 999, cash_tendered_cents: 1000 },
        { method: "card", amount_cents: 2000, approval_code: "AUTH12" },
      ],
    };

    const res = await postSale(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "split_total_mismatch" });
  });

  it("single payment via payments[] resolves to that method (NOT 'split')", async () => {
    const product = t.products[0]!;
    const total = Number(product.price_cents);
    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [{ method: "cash", amount_cents: total, cash_tendered_cents: total }],
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);
    expect(res.body.payment_method).toBe("cash");

    const payments = await readSalePayments(res.body.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.method).toBe("cash");
  });

  it("split with bank_transfer slice → payment_status='payment_pending'", async () => {
    const product = t.products[1]!; // 7000 cents
    const total = Number(product.price_cents);
    const cashAmount = 1000;
    const transferAmount = total - cashAmount;
    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [
        { method: "cash", amount_cents: cashAmount, cash_tendered_cents: cashAmount },
        { method: "bank_transfer", amount_cents: transferAmount },
      ],
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);
    expect(res.body.payment_method).toBe("split");
    expect(res.body.payment_status).toBe("payment_pending");

    const payments = await readSalePayments(res.body.id);
    expect(payments).toHaveLength(2);
    const transfer = payments.find((p) => p.method === "bank_transfer")!;
    expect(transfer.amount_cents).toBe(BigInt(transferAmount));
  });

  it("split with store_credit slice → ledger row inserted, balance deducted", async () => {
    const product = t.products[0]!; // 3500
    const total = Number(product.price_cents);
    const creditStart = 5000n;
    const customer = await adminPrisma.customer.create({
      data: {
        tenant_id: t.tenantId,
        name: "Split Tender Customer",
        store_credit_balance_minor: creditStart,
        store_credit_currency_code: "USD",
      },
    });

    const creditAmount = 1000;
    const cashAmount = total - creditAmount;
    const body = {
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [
        { method: "store_credit", amount_cents: creditAmount },
        { method: "cash", amount_cents: cashAmount, cash_tendered_cents: cashAmount },
      ],
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);
    expect(res.body.payment_method).toBe("split");

    const ledger = await adminPrisma.storeCreditLedger.findMany({
      where: { tenant_id: t.tenantId, customer_id: customer.id },
    });
    expect(ledger.length).toBeGreaterThanOrEqual(1);
    const refund = ledger.find((l) => l.reference_table === "sale");
    expect(refund).toBeDefined();
    expect(refund!.amount_minor).toBe(BigInt(-creditAmount));

    const after = await adminPrisma.customer.findUnique({ where: { id: customer.id } });
    expect(after!.store_credit_balance_minor).toBe(creditStart - BigInt(creditAmount));

    const payments = await readSalePayments(res.body.id);
    const sc = payments.find((p) => p.method === "store_credit");
    expect(sc).toBeDefined();
    expect(sc!.store_credit_ledger_id).toBe(refund!.id);
  });

  it("audit `after.payments` lists each slice's method + masked details", async () => {
    const product = t.products[2]!; // 4500
    const total = Number(product.price_cents);
    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [
        { method: "cash", amount_cents: 2500, cash_tendered_cents: 2500 },
        { method: "card", amount_cents: total - 2500, approval_code: "AUTH9988" },
      ],
    };

    const res = await postSale(body);
    expect(res.status).toBe(201);

    const audit = await readAuditLog(t.tenantId, "sale_completed");
    const row = audit.find(
      (a) => (a.after as { code?: string } | null)?.code === res.body.code,
    );
    expect(row).toBeDefined();
    const after = row!.after as {
      payment_method: string;
      payments?: Array<{ method: string; amount_cents: string; approval_code?: string }>;
    };
    expect(after.payment_method).toBe("split");
    expect(Array.isArray(after.payments)).toBe(true);
    expect(after.payments).toHaveLength(2);
    const methods = after.payments!.map((p) => p.method).sort();
    expect(methods).toEqual(["card", "cash"]);
    // Approval code masked (last 4) — never log the full code.
    const card = after.payments!.find((p) => p.method === "card")!;
    expect(card.approval_code).not.toBe("AUTH9988");
    expect(card.approval_code).toMatch(/9988$/);
  });
});
