import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readBranchStock,
  readSaleWithLines,
  readStockMovements,
} from "../helpers/fixtures";

describe("POST /v1/sales — bank transfer", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("creates sale with payment_status='payment_pending'; inventory STILL commits", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "sale-transfer" });
    const tokens = booted.app.get(TokenService);
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const p = t.products[0]!;

    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "bank_transfer" as const,
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: p.id, qty: 3, line_discount_cents: 0, note: null }],
    };

    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${pair.access_token}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.payment_status).toBe("payment_pending");
    expect(res.body.payment_method).toBe("bank_transfer");
    expect(res.body.total_cents).toBe(String(3500n * 3n));
    expect(res.body.cash_tendered_cents).toBeNull();
    expect(res.body.change_due_cents).toBeNull();

    // Sale persisted with payment_pending.
    const sale = await readSaleWithLines(res.body.id);
    expect(sale!.sale.payment_status).toBe("payment_pending");

    // Inventory STILL decremented — CLAUDE.md rule: inventory commits regardless of payment status.
    expect(await readBranchStock(t.tenantId, t.branchId, p.id)).toBe(p.starting_qty - 3);
    const movements = await readStockMovements(t.tenantId, p.id);
    expect(movements.filter((m) => m.kind === "sale" && m.qty_delta === -3 && m.reference_table === "sales")).toHaveLength(1);
  });

  it("rejects cash_tendered_cents on bank_transfer requests (silently ignored)", async () => {
    // bank_transfer with cash_tendered_cents — the DTO doesn't reject it
    // (the field is optional), but the response should never echo a tender.
    const t = await makeTenantWithCatalog({ slugPrefix: "sale-transfer-mix" });
    const tokens = booted.app.get(TokenService);
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const p = t.products[0]!;

    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${pair.access_token}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: t.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "bank_transfer",
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [{ product_id: p.id, qty: 1, line_discount_cents: 0, note: null }],
        cash_tendered_cents: 99999, // ignored — bank transfer doesn't tender cash
      });

    expect(res.status).toBe(201);
    expect(res.body.cash_tendered_cents).toBeNull();
    expect(res.body.change_due_cents).toBeNull();
  });
});
