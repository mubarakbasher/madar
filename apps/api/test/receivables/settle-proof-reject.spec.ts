import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantBankAccount,
  makeTenantWithCatalog,
  readAuditLog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("Rejecting a settlement's payment proof reopens the receivable balance", () => {
  let booted: BootedTestApp;
  let storageRoot: string;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "recv-reject" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  async function makeCustomer() {
    return adminPrisma.customer.create({
      data: {
        tenant_id: t.tenantId,
        name: `Credit Customer ${randomUUID().slice(0, 6)}`,
      },
    });
  }

  function postSale(body: Record<string, unknown>) {
    return request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  async function makeFullCreditSale(customerId: string, productIndex = 0) {
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

  function postSettle(customerId: string, body: Record<string, unknown>) {
    return request(booted.http)
      .post(`/v1/customers/${customerId}/receivables/settle`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  it("full flow: partial sale -> bank-transfer settle -> submit proof -> reject -> balance reopens", async () => {
    const customer = await makeCustomer();
    const { saleId, total } = await makeFullCreditSale(customer.id);

    // First settle a slice in cash so a reversal of the bank-transfer slice
    // must land back at partially_paid, not unpaid.
    const cashSlice = Math.floor(total / 4);
    const cashSettle = await postSettle(customer.id, {
      sale_id: saleId,
      method: "cash",
      amount_cents: cashSlice,
      cash_tendered_cents: cashSlice,
    });
    expect(cashSettle.status).toBe(200);

    const bankSlice = Math.floor(total / 4);
    const bankSettle = await postSettle(customer.id, {
      sale_id: saleId,
      method: "bank_transfer",
      amount_cents: bankSlice,
    });
    expect(bankSettle.status).toBe(200);
    const salePaymentId = bankSettle.body.sale_payment_id as string;

    const dueAfterBothSettlements = total - cashSlice - bankSlice;
    const saleAfterSettle = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(saleAfterSettle!.balance_due_cents).toBe(BigInt(dueAfterBothSettlements));
    expect(saleAfterSettle!.payment_status).toBe("partially_paid");

    const custAfterSettle = await adminPrisma.customer.findUnique({ where: { id: customer.id } });
    expect(custAfterSettle!.receivable_balance_minor).toBe(BigInt(dueAfterBothSettlements));

    const bank = await makeTenantBankAccount(t.tenantId);
    const jpg = await tinyJpegBuffer();
    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", saleId)
      .field("amount_cents", String(bankSlice))
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-SETTLE-REJ")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    // The submit path should have back-linked the settlement payment to the proof.
    const linkedPayment = await adminPrisma.salePayment.findUnique({
      where: { id: salePaymentId },
    });
    expect(linkedPayment!.payment_proof_id).toBe(submit.body.id);

    const reject = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/reject`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rejection_reason: "Receipt does not match bank statement" });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe("rejected");

    const saleAfterReject = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(saleAfterReject!.balance_due_cents).toBe(BigInt(dueAfterBothSettlements + bankSlice));
    expect(saleAfterReject!.payment_status).toBe("partially_paid");

    const custAfterReject = await adminPrisma.customer.findUnique({ where: { id: customer.id } });
    expect(custAfterReject!.receivable_balance_minor).toBe(
      BigInt(dueAfterBothSettlements + bankSlice),
    );

    // Original negative ledger row untouched; a new positive reversing row exists.
    const ledgerRows = await adminPrisma.customerReceivableLedger.findMany({
      where: {
        tenant_id: t.tenantId,
        customer_id: customer.id,
        reference_table: "sale_payment",
        reference_id: salePaymentId,
      },
      orderBy: { created_at: "asc" },
    });
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows[0]!.amount_minor).toBe(-BigInt(bankSlice));
    expect(ledgerRows[1]!.amount_minor).toBe(BigInt(bankSlice));

    const audit = await readAuditLog(t.tenantId, "receivable_reopened");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("rejecting a settlement that covered the full balance returns the sale to unpaid", async () => {
    const customer = await makeCustomer();
    const { saleId, total } = await makeFullCreditSale(customer.id, 1);

    const settle = await postSettle(customer.id, {
      sale_id: saleId,
      method: "bank_transfer",
      amount_cents: total,
    });
    expect(settle.status).toBe(200);
    const salePaymentId = settle.body.sale_payment_id as string;

    const saleAfterSettle = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(saleAfterSettle!.balance_due_cents).toBe(0n);
    expect(saleAfterSettle!.payment_status).toBe("paid");

    const bank = await makeTenantBankAccount(t.tenantId);
    const jpg = await tinyJpegBuffer();
    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", saleId)
      .field("amount_cents", String(total))
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-SETTLE-FULL-REJ")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    const linkedPayment = await adminPrisma.salePayment.findUnique({
      where: { id: salePaymentId },
    });
    expect(linkedPayment!.payment_proof_id).toBe(submit.body.id);

    const reject = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/reject`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rejection_reason: "Bank reference not found" });
    expect(reject.status).toBe(200);

    const saleAfterReject = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(saleAfterReject!.balance_due_cents).toBe(BigInt(total));
    expect(saleAfterReject!.payment_status).toBe("unpaid");

    const custAfterReject = await adminPrisma.customer.findUnique({ where: { id: customer.id } });
    expect(custAfterReject!.receivable_balance_minor).toBe(BigInt(total));
  });
});
