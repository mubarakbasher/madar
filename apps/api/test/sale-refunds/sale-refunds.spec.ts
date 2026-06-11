/**
 * Customer refunds — POST /v1/sale-refunds.
 *
 * Verifies the heavy paths: happy full refund + sale flips to `refunded`,
 * partial refund + denormalized counter advances, line qty enforcement,
 * payment-sum mismatch, RLS canary, manager approval threshold gate,
 * impersonation block, store-credit refund creates a ledger entry + bumps
 * the customer balance.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, makeTenant, readAuditLog } from "../helpers/fixtures";

interface SaleSetup {
  saleId: string;
  saleLineId: string;
  productId: string;
  branchId: string;
  totalCents: bigint;
  unitPriceCents: bigint;
}

describe("Sale refunds (/v1/sale-refunds) — B2", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  let fix: Awaited<ReturnType<typeof makeTenantWithCatalog>>;
  let ownerToken: string;
  let cashierUserId: string;
  let cashierToken: string;

  let tenantB: Awaited<ReturnType<typeof makeTenant>>;
  let ownerTokenB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    fix = await makeTenantWithCatalog({ slugPrefix: "refunds-a" });
    ownerToken = (
      await tokens.mintPair({ userId: fix.userId, tenantId: fix.tenantId, role: "owner" })
    ).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: fix.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier Carla",
        role: "cashier",
        branch_id: fix.branchId,
        locale: "en",
      },
    });
    cashierUserId = cashier.id;
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: fix.tenantId, role: "cashier" })
    ).access_token;

    tenantB = await makeTenant({ slugPrefix: "refunds-b" });
    ownerTokenB = (
      await tokens.mintPair({ userId: tenantB.userId, tenantId: tenantB.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  async function ringSale(productIndex: number, qty: number): Promise<SaleSetup> {
    const product = fix.products[productIndex]!;
    const unit = product.price_cents;
    const total = unit * BigInt(qty);
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [
          { product_id: product.id, qty, line_discount_cents: 0, note: null },
        ],
        cash_tendered_cents: Number(total),
      });
    expect(res.status).toBe(201);
    const saleLineId = res.body.lines[0].id;
    return {
      saleId: res.body.id,
      saleLineId,
      productId: product.id,
      branchId: fix.branchId,
      totalCents: total,
      unitPriceCents: unit,
    };
  }

  // ─── 1. happy full cash refund → sale flips to refunded + stock back ──

  it("full refund (cash) flips sale.payment_status to refunded, restocks, audits", async () => {
    const sale = await ringSale(0, 2);

    const beforeStock = await adminPrisma.branchStock.findFirst({
      where: { tenant_id: fix.tenantId, branch_id: sale.branchId, product_id: sale.productId },
      select: { qty_on_hand: true },
    });
    expect(beforeStock).toBeTruthy();
    const before = beforeStock!.qty_on_hand;

    const totalNum = Number(sale.totalCents);

    const r = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 2 }],
        payments: [{ method: "cash", amount_cents: totalNum }],
        notes: "Customer changed mind",
      });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^RFN-/);
    expect(r.body.total_cents).toBe(sale.totalCents.toString());
    expect(r.body.lines[0].qty).toBe(2);

    const saleAfter = await adminPrisma.sale.findUnique({
      where: { id: sale.saleId },
      select: { payment_status: true, refunded_amount_cents: true },
    });
    expect(saleAfter?.payment_status).toBe("refunded");
    expect(saleAfter?.refunded_amount_cents.toString()).toBe(sale.totalCents.toString());

    const stockAfter = await adminPrisma.branchStock.findFirst({
      where: { tenant_id: fix.tenantId, branch_id: sale.branchId, product_id: sale.productId },
      select: { qty_on_hand: true },
    });
    expect(stockAfter!.qty_on_hand).toBe(before + 2);

    const movements = await adminPrisma.stockMovement.findMany({
      where: { reference_table: "sale_refunds", reference_id: r.body.id },
    });
    expect(movements.length).toBe(1);
    expect(movements[0]!.kind).toBe("return_in");
    expect(movements[0]!.qty_delta).toBe(2);

    const audit = await readAuditLog(fix.tenantId, "sale_refunded");
    expect(audit.length).toBeGreaterThan(0);
  });

  // ─── 2. partial refund → status stays paid, counter advances ────────

  it("partial refund: status stays 'paid', refunded_amount_cents advances, qty cap enforced", async () => {
    const sale = await ringSale(1, 3);
    const unit = Number(sale.unitPriceCents);

    const r1 = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "cash", amount_cents: unit }],
      });
    expect(r1.status).toBe(201);

    const after1 = await adminPrisma.sale.findUnique({
      where: { id: sale.saleId },
      select: { payment_status: true, refunded_amount_cents: true },
    });
    expect(after1?.payment_status).toBe("paid");
    expect(after1?.refunded_amount_cents.toString()).toBe(String(unit));

    // qty 3 on the line, 1 already refunded → 2 remaining. Asking for 3 must
    // fail with 422 qty_exceeds_remaining.
    const tooMuch = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 3 }],
        payments: [{ method: "cash", amount_cents: unit * 3 }],
      });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe("qty_exceeds_remaining");
  });

  // ─── 3. payment sum mismatch → 422 ──────────────────────────────────

  it("payment total != refund total returns 422 refund_total_mismatch", async () => {
    const sale = await ringSale(2, 1);
    const r = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "cash", amount_cents: Number(sale.totalCents) - 100 }],
      });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("refund_total_mismatch");
  });

  // ─── 4. RLS canary — tenant B blocked from refunding tenant A's sale ─

  it("tenant B receives 404 when refunding tenant A's sale", async () => {
    const sale = await ringSale(0, 1);
    const r = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerTokenB}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "cash", amount_cents: Number(sale.totalCents) }],
      });
    expect(r.status).toBe(404);
  });

  // ─── 5. manager-approval threshold gate ──────────────────────────────

  it("cashier-initiated refund above threshold requires approver", async () => {
    // Threshold default is 5000 cents ($50). products[1].price = 7000.
    const sale = await ringSale(1, 1);
    const totalNum = Number(sale.totalCents);

    const denied = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "cash", amount_cents: totalNum }],
      });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("manager_approval_required");

    // An approver id WITHOUT the approver's password is not approval.
    const noPassword = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "cash", amount_cents: totalNum }],
        approved_by_user_id: fix.userId,
      });
    expect(noPassword.status).toBe(403);
    expect(noPassword.body.code).toBe("manager_approval_required");

    // A wrong password is rejected without leaking which part failed.
    const wrongPassword = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "cash", amount_cents: totalNum }],
        approved_by_user_id: fix.userId,
        approver_password: "not-the-password",
      });
    expect(wrongPassword.status).toBe(403);
    expect(wrongPassword.body.code).toBe("invalid_approver");

    // With the owner's real credentials, the refund goes through.
    const ok = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "cash", amount_cents: totalNum }],
        approved_by_user_id: fix.userId,
        approver_password: fix.password,
      });
    expect(ok.status).toBe(201);
    expect(ok.body.requires_manager).toBe(true);
    expect(ok.body.approved_by_user_id).toBe(fix.userId);
  });

  // ─── 6. store-credit refund creates ledger entry + bumps balance ────

  it("store-credit refund creates a positive ledger entry + updates customer balance", async () => {
    // Create a customer first.
    const customer = await adminPrisma.customer.create({
      data: {
        tenant_id: fix.tenantId,
        name: "Refund Recipient",
        store_credit_balance_minor: 0n,
      },
    });

    const sale = await ringSale(0, 1);
    const totalNum = Number(sale.totalCents);

    const r = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        customer_id: customer.id,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "store_credit", amount_cents: totalNum }],
      });
    expect(r.status).toBe(201);
    expect(r.body.payments[0].method).toBe("store_credit");
    expect(r.body.payments[0].store_credit_ledger_id).toBeTruthy();

    const fresh = await adminPrisma.customer.findUnique({
      where: { id: customer.id },
      select: { store_credit_balance_minor: true, store_credit_currency_code: true },
    });
    expect(fresh?.store_credit_balance_minor.toString()).toBe(String(totalNum));
    expect(fresh?.store_credit_currency_code).toBe("USD");

    const ledger = await adminPrisma.storeCreditLedger.findFirst({
      where: { customer_id: customer.id, reference_id: r.body.id },
    });
    expect(ledger).toBeTruthy();
    expect(ledger?.amount_minor.toString()).toBe(String(totalNum));
    expect(ledger?.reference_table).toBe("refund");
  });

  // ─── 8. discounted line refunds the NET amount paid, never the gross ─

  it("discounted line: refund equals the discounted amount paid, gross is rejected", async () => {
    const product = fix.products[0]!;
    const unit = product.price_cents; // gross per-unit
    const qty = 2;
    const discount = 500n; // 5.00 off the line
    const paid = unit * BigInt(qty) - discount;

    const saleRes = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [
          {
            product_id: product.id,
            qty,
            line_discount_cents: Number(discount),
            note: null,
          },
        ],
        cash_tendered_cents: Number(paid),
      });
    expect(saleRes.status).toBe(201);
    const saleLineId = saleRes.body.lines[0].id;

    // Refunding at the GROSS price must fail — that money was never paid.
    const gross = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: saleRes.body.id,
        lines: [{ sale_line_id: saleLineId, qty }],
        payments: [{ method: "cash", amount_cents: Number(unit * BigInt(qty)) }],
      });
    expect(gross.status).toBe(422);
    expect(gross.body.code).toBe("refund_total_mismatch");

    // Refunding the discounted (paid) amount succeeds and fully closes the sale.
    const ok = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: saleRes.body.id,
        lines: [{ sale_line_id: saleLineId, qty }],
        payments: [{ method: "cash", amount_cents: Number(paid) }],
      });
    expect(ok.status).toBe(201);
    expect(ok.body.total_cents).toBe(paid.toString());

    const after = await adminPrisma.sale.findUnique({
      where: { id: saleRes.body.id },
      select: { payment_status: true, refunded_amount_cents: true },
    });
    expect(after?.payment_status).toBe("refunded");
    expect(after?.refunded_amount_cents.toString()).toBe(paid.toString());
  });

  // ─── 9. remainder cents: sequential partials sum exactly to the total ─

  it("three 1-unit refunds of an indivisible total sum exactly to the paid amount", async () => {
    const product = fix.products[0]!;
    const qty = 3;
    const discount = 2n; // makes paid = 3·unit − 2, not divisible by 3
    const paid = product.price_cents * BigInt(qty) - discount;

    const saleRes = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [
          { product_id: product.id, qty, line_discount_cents: Number(discount), note: null },
        ],
        cash_tendered_cents: Number(paid),
      });
    expect(saleRes.status).toBe(201);
    const saleLineId = saleRes.body.lines[0].id;

    // Cumulative allocation: slice k = floor(paid·k/3) − floor(paid·(k−1)/3).
    const upTo = (k: bigint) => (paid * k) / 3n;
    const slices = [upTo(1n), upTo(2n) - upTo(1n), upTo(3n) - upTo(2n)];
    expect(slices[0]! + slices[1]! + slices[2]!).toBe(paid);

    for (const slice of slices) {
      const r = await request(booted.http)
        .post("/v1/sale-refunds")
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("Idempotency-Key", randomUUID())
        .send({
          sale_id: saleRes.body.id,
          lines: [{ sale_line_id: saleLineId, qty: 1 }],
          payments: [{ method: "cash", amount_cents: Number(slice) }],
        });
      expect(r.status).toBe(201);
    }

    const after = await adminPrisma.sale.findUnique({
      where: { id: saleRes.body.id },
      select: { payment_status: true, refunded_amount_cents: true },
    });
    // No cent lost to floor division: the sale flips to fully refunded.
    expect(after?.refunded_amount_cents.toString()).toBe(paid.toString());
    expect(after?.payment_status).toBe("refunded");
  });

  // ─── 10. unpaid sales cannot be refunded ─────────────────────────────

  it("payment_pending (bank transfer) sale returns 422 sale_not_paid", async () => {
    const product = fix.products[0]!;
    const total = product.price_cents;
    const saleRes = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "bank_transfer",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      });
    expect(saleRes.status).toBe(201);
    expect(saleRes.body.payment_status).toBe("payment_pending");

    const r = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: saleRes.body.id,
        lines: [{ sale_line_id: saleRes.body.lines[0].id, qty: 1 }],
        payments: [{ method: "cash", amount_cents: Number(total) }],
      });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("sale_not_paid");
  });

  // ─── 7. store-credit without customer → 400 ─────────────────────────

  it("store-credit refund without customer_id returns 400", async () => {
    const sale = await ringSale(0, 1);
    const r = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: sale.saleId,
        lines: [{ sale_line_id: sale.saleLineId, qty: 1 }],
        payments: [{ method: "store_credit", amount_cents: Number(sale.totalCents) }],
      });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("store_credit_requires_customer");
  });
});
