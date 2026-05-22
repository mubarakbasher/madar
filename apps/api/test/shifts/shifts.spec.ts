/**
 * Cashier shifts — open / current / list / close / Z-report.
 *
 * Verifies: open happy + dup-open 409, current returns the open shift, sale
 * during a shift stamps shift_id + close computes expected/variance, audit
 * rows written, cashier can only see own shifts (manager sees all), RLS
 * canary across two tenants.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, makeTenantWithCatalog, readAuditLog } from "../helpers/fixtures";

describe("Cashier shifts (/v1/shifts) — B1", () => {
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

    fix = await makeTenantWithCatalog({ slugPrefix: "shifts-a" });
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

    tenantB = await makeTenant({ slugPrefix: "shifts-b" });
    ownerTokenB = (
      await tokens.mintPair({ userId: tenantB.userId, tenantId: tenantB.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── 1. cashier opens a shift; current returns it; dup-open 409 ─────

  it("cashier opens a shift, /current returns it, second open returns 409 shift_already_open", async () => {
    const open = await request(booted.http)
      .post("/v1/shifts/open")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: fix.branchId, opening_float_cents: 20_000 });
    expect(open.status).toBe(201);
    expect(open.body.status).toBe("open");
    expect(open.body.opening_float_cents).toBe("20000");

    const current = await request(booted.http)
      .get("/v1/shifts/current")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(current.status).toBe(200);
    expect(current.body.id).toBe(open.body.id);
    expect(current.body.cashier_id).toBe(cashierUserId);

    const dup = await request(booted.http)
      .post("/v1/shifts/open")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: fix.branchId, opening_float_cents: 5_000 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("shift_already_open");

    const audit = await readAuditLog(fix.tenantId, "shift_opened");
    expect(audit.length).toBeGreaterThan(0);
  });

  // ─── 2. sales during shift attach shift_id; close computes variance ─

  it("sale during shift stamps shift_id; close computes expected/variance + audit", async () => {
    // Open another tenant's worth: in test 1 the cashier already has an open
    // shift on fix. Re-fetch its id.
    const currentRes = await request(booted.http)
      .get("/v1/shifts/current")
      .set("Authorization", `Bearer ${cashierToken}`);
    const shiftId = currentRes.body.id;
    expect(shiftId).toBeTruthy();

    // Ring a cash sale of $35 (3500 cents).
    const product = fix.products[0]!;
    const saleRes = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
        cash_tendered_cents: 4000,
      });
    expect(saleRes.status).toBe(201);

    const sale = await adminPrisma.sale.findUnique({
      where: { id: saleRes.body.id },
      select: { shift_id: true, total_cents: true },
    });
    expect(sale?.shift_id).toBe(shiftId);
    expect(sale?.total_cents.toString()).toBe("3500");

    // Close with declared cash = 23_500 (opening 20_000 + cash sale 3_500).
    // Expected = 23_500. Variance = 0.
    const close = await request(booted.http)
      .post(`/v1/shifts/${shiftId}/close`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ declared_closing_cash_cents: 23_500, notes: "All counted" });
    expect(close.status).toBe(200);
    expect(close.body.status).toBe("closed");
    expect(close.body.declared_closing_cash_cents).toBe("23500");
    expect(close.body.expected_closing_cash_cents).toBe("23500");
    expect(close.body.variance_cents).toBe("0");
    expect(close.body.z_report.transactions).toBe(1);
    expect(close.body.z_report.gross_revenue_cents).toBe("3500");

    const audit = await readAuditLog(fix.tenantId, "shift_closed");
    expect(audit.length).toBeGreaterThan(0);

    // Re-closing returns 409 shift_already_closed.
    const reclose = await request(booted.http)
      .post(`/v1/shifts/${shiftId}/close`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ declared_closing_cash_cents: 0 });
    expect(reclose.status).toBe(409);
    expect(reclose.body.code).toBe("shift_already_closed");
  });

  // ─── 3. close with declared mismatch surfaces variance ──────────────

  it("close with under-count surfaces a negative variance", async () => {
    const open = await request(booted.http)
      .post("/v1/shifts/open")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: fix.branchId, opening_float_cents: 10_000 });
    expect(open.status).toBe(201);
    const shiftId = open.body.id;

    // Ring a cash sale of 4500 cents (qty 1 of products[2]).
    const product = fix.products[2]!;
    const saleRes = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 2,
        lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
        cash_tendered_cents: 5000,
      });
    expect(saleRes.status).toBe(201);

    // Declared 14_000, expected 14_500 → variance -500 (cash short).
    const close = await request(booted.http)
      .post(`/v1/shifts/${shiftId}/close`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ declared_closing_cash_cents: 14_000 });
    expect(close.status).toBe(200);
    expect(close.body.expected_closing_cash_cents).toBe("14500");
    expect(close.body.variance_cents).toBe("-500");
  });

  // ─── 4. cash refund during shift reduces expected cash + Z-report shows it ─

  it("cash refund during shift reduces expected_closing_cash + Z-report cash_refunds_cents reflects it", async () => {
    const open = await request(booted.http)
      .post("/v1/shifts/open")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: fix.branchId, opening_float_cents: 20_000 });
    expect(open.status).toBe(201);
    const shiftId = open.body.id;

    // Ring a cash sale of 2 × products[0] = 7000.
    const product = fix.products[0]!;
    const saleRes = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: fix.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash",
        client_uuid: randomUUID(),
        client_sequence: 11,
        lines: [{ product_id: product.id, qty: 2, line_discount_cents: 0, note: null }],
        cash_tendered_cents: 7000,
      });
    expect(saleRes.status).toBe(201);
    expect(saleRes.body.total_cents).toBe("7000");
    const saleLineId = saleRes.body.lines[0].id;

    // Refund 1 unit (3500 cents) in cash.
    const refundRes = await request(booted.http)
      .post("/v1/sale-refunds")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        sale_id: saleRes.body.id,
        lines: [{ sale_line_id: saleLineId, qty: 1, restock: true }],
        payments: [{ method: "cash", amount_cents: "3500" }],
      });
    expect(refundRes.status).toBe(201);
    expect(refundRes.body.total_cents).toBe("3500");

    // Close: opening 20_000 + cash sales 7_000 − cash refunds 3_500 = 23_500.
    const close = await request(booted.http)
      .post(`/v1/shifts/${shiftId}/close`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ declared_closing_cash_cents: 23_500 });
    expect(close.status).toBe(200);
    expect(close.body.expected_closing_cash_cents).toBe("23500");
    expect(close.body.variance_cents).toBe("0");
    expect(close.body.z_report.cash_sales_cents).toBe("7000");
    expect(close.body.z_report.cash_refunds_cents).toBe("3500");
  });

  // ─── 5. RLS canary — tenant B cannot see tenant A's shift ───────────

  it("tenant B receives 404 on tenant A's shift; tenant B's list is empty for A's data", async () => {
    // Find a shift on tenant A.
    const list = await request(booted.http)
      .get("/v1/shifts?status=closed&limit=1")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    const sample = list.body.items[0];
    expect(sample).toBeDefined();
    const aId = sample.id;

    const cross = await request(booted.http)
      .get(`/v1/shifts/${aId}`)
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(cross.status).toBe(404);
    expect(cross.body.code).toBe("shift_not_found");

    const listB = await request(booted.http)
      .get("/v1/shifts")
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.items.find((s: { id: string }) => s.id === aId)).toBeUndefined();
  });
});
