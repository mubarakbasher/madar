import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
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

describe("POST /v1/sales — card payment method", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "sale-card" });
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
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

  it("happy card sale → 201, payment_status='paid', approval_code persisted, inventory committed", async () => {
    const p = t.products[0]!;
    const body = {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "card" as const,
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: p.id, qty: 2, line_discount_cents: 0, note: null }],
      approval_code: "APP1234",
    };

    const res = await postSale(body);

    expect(res.status).toBe(201);
    expect(res.body.payment_method).toBe("card");
    expect(res.body.payment_status).toBe("paid");
    expect(res.body.total_cents).toBe(String(p.price_cents * 2n));
    expect(res.body.cash_tendered_cents).toBeNull();
    expect(res.body.change_due_cents).toBeNull();

    // Sale persisted with approval_code stored on `sales.approval_code`.
    const persisted = await adminPrisma.sale.findUnique({
      where: { id: res.body.id },
      select: { approval_code: true, payment_status: true, payment_method: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.approval_code).toBe("APP1234");
    expect(persisted!.payment_status).toBe("paid");
    expect(persisted!.payment_method).toBe("card");

    const sale = await readSaleWithLines(res.body.id);
    expect(sale!.sale.payment_status).toBe("paid");
    expect(sale!.lines).toHaveLength(1);

    // Inventory committed — same rule as cash + bank_transfer.
    expect(await readBranchStock(t.tenantId, t.branchId, p.id)).toBe(p.starting_qty - 2);
    const mv = await readStockMovements(t.tenantId, p.id);
    expect(
      mv.filter((m) => m.kind === "sale" && m.qty_delta === -2 && m.reference_table === "sales"),
    ).toHaveLength(1);
  });

  it("400 when payment_method='card' is missing approval_code", async () => {
    const p = t.products[1]!;
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "card",
      client_uuid: randomUUID(),
      client_sequence: 2,
      lines: [{ product_id: p.id, qty: 1, line_discount_cents: 0 }],
      // no approval_code
    });
    expect(res.status).toBe(400);
    // Either the zod refinement or the service guard produced the failure.
    const code = (res.body && (res.body.code as string | undefined)) ?? "";
    expect(["approval_code_required", "validation_failed", ""]).toContain(code);
  });

  it("400 when approval_code is too short (3 chars)", async () => {
    const p = t.products[1]!;
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "card",
      client_uuid: randomUUID(),
      client_sequence: 3,
      lines: [{ product_id: p.id, qty: 1, line_discount_cents: 0 }],
      approval_code: "ABC",
    });
    expect(res.status).toBe(400);
  });

  it("audit row has after.approval_code_last4 set and does NOT contain raw approval_code", async () => {
    const p = t.products[2]!;
    const approval = "TERMINAL-99887766";
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "card",
      client_uuid: randomUUID(),
      client_sequence: 4,
      lines: [{ product_id: p.id, qty: 1, line_discount_cents: 0, note: null }],
      approval_code: approval,
    });
    expect(res.status).toBe(201);

    // Find the sale_completed audit row for this sale.
    const rows = await readAuditLog(t.tenantId, "sale_completed");
    const row = rows.find((r) => {
      const after = r.after as { code?: string } | null;
      return after?.code === res.body.code;
    });
    expect(row).toBeDefined();
    const after = row!.after as Record<string, unknown>;
    expect(after.payment_method).toBe("card");
    expect(after.payment_status).toBe("paid");
    expect(after.approval_code_last4).toBe(approval.slice(-4));
    // The raw approval_code must NOT be in the audit log — mask only.
    expect(after.approval_code).toBeUndefined();
    expect(JSON.stringify(after)).not.toContain(approval);
  });
});
