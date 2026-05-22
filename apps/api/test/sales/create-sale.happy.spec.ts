import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  readBranchStock,
  readSaleWithLines,
  readStockMovements,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

describe("POST /v1/sales — happy path (cash)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "sale-happy" });
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("creates a paid cash sale, commits inventory, writes audit, returns full sale shape", async () => {
    const p1 = t.products[0]!; // 3500 / 1200
    const p2 = t.products[1]!; // 7000 / 2200

    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash" as const,
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [
        { product_id: p1.id, qty: 2, line_discount_cents: 0, note: null },
        { product_id: p2.id, qty: 1, line_discount_cents: 500, note: "oat milk" },
      ],
      cash_tendered_cents: 14000, // 3500*2 + (7000-500) = 7000 + 6500 = 13500, tendered 14000 → change 500
    };

    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^TX-[A-Z0-9]{6,}$/);
    expect(res.body.payment_status).toBe("paid");
    expect(res.body.payment_method).toBe("cash");
    expect(res.body.total_cents).toBe("13500");
    expect(res.body.subtotal_cents).toBe("14000"); // sum(line_total + line_discount) = 7000 + (6500+500) = 14000
    expect(res.body.discount_cents).toBe("500");
    expect(res.body.tax_cents).toBe("0");
    expect(res.body.cash_tendered_cents).toBe("14000");
    expect(res.body.change_due_cents).toBe("500");
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0]).toMatchObject({
      product_id: p1.id,
      qty: 2,
      unit_price_cents: "3500",
      line_total_cents: "7000",
      cogs_snapshot_cents: "2400", // 1200 * 2
    });
    expect(res.body.lines[1]).toMatchObject({
      product_id: p2.id,
      qty: 1,
      unit_price_cents: "7000",
      discount_cents: "500",
      line_total_cents: "6500",
      cogs_snapshot_cents: "2200",
      note: "oat milk",
    });

    // Sale row written.
    const sale = await readSaleWithLines(res.body.id);
    expect(sale).not.toBeNull();
    expect(sale!.sale.payment_status).toBe("paid");
    expect(sale!.sale.client_uuid).toBe(body.client_uuid);
    expect(sale!.lines).toHaveLength(2);

    // Stock movements: one per line, kind='sale', negative qty_delta, reference_table='sales'.
    const mv1 = await readStockMovements(t.tenantId, p1.id);
    expect(mv1.filter((m) => m.kind === "sale" && m.qty_delta === -2 && m.reference_table === "sales")).toHaveLength(1);
    const mv2 = await readStockMovements(t.tenantId, p2.id);
    expect(mv2.filter((m) => m.kind === "sale" && m.qty_delta === -1 && m.reference_table === "sales")).toHaveLength(1);

    // Branch stock decremented by exactly the sold qty.
    expect(await readBranchStock(t.tenantId, t.branchId, p1.id)).toBe(p1.starting_qty - 2);
    expect(await readBranchStock(t.tenantId, t.branchId, p2.id)).toBe(p2.starting_qty - 1);

    // Audit log: one row, action 'sale_completed'.
    const audit = await readAuditLog(t.tenantId, "sale_completed");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after).toMatchObject({
      payment_method: "cash",
      payment_status: "paid",
      total_cents: "13500",
      line_count: 2,
    });
  });
});
