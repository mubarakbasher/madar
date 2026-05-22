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
  readStockMovements,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * State-machine coverage: draft → ordered → received | cancelled. Inventory
 * commits on receive (one stock_movement + branch_stock upsert per qty>0 line).
 */
describe("Purchase-order state machine (order / receive / cancel)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let supplierId: string;
  let supplierNoEmailId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "po-sm" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const supplier = await adminPrisma.supplier.create({
      data: {
        tenant_id: t.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "SM Supplier", ar: "SM" },
        currency_code: "USD",
        contact_email: "sm-supplier@example.test",
      },
    });
    supplierId = supplier.id;

    const supplierNoEmail = await adminPrisma.supplier.create({
      data: {
        tenant_id: t.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Quiet Supplier", ar: "Quiet" },
        currency_code: "USD",
      },
    });
    supplierNoEmailId = supplierNoEmail.id;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  async function makeDraft(opts: {
    productIndex?: number;
    qty?: number;
    unitCost?: number;
    extraLines?: Array<{ productIndex: number; qty: number; unitCost: number }>;
    supplier?: string;
  }): Promise<string> {
    const productIndex = opts.productIndex ?? 0;
    const qty = opts.qty ?? 5;
    const unitCost = opts.unitCost ?? 1000;
    const lines = [
      {
        product_id: t.products[productIndex]!.id,
        qty_ordered: qty,
        unit_cost_cents: unitCost,
      },
      ...(opts.extraLines ?? []).map((e) => ({
        product_id: t.products[e.productIndex]!.id,
        qty_ordered: e.qty,
        unit_cost_cents: e.unitCost,
      })),
    ];
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: opts.supplier ?? supplierId,
        branch_id: t.branchId,
        lines,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("draft → ordered: writes audit, sets ordered_at, no email enqueued by default", async () => {
    const id = await makeDraft({});
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ordered");
    expect(res.body.ordered_at).toBeTruthy();
    const audit = await readAuditLog(t.tenantId, "purchase_order_ordered");
    const last = audit[0]!;
    expect(last.after).toMatchObject({ sent_email: false });
  });

  it("draft → ordered with send_email=true: audit captures recipient even via inline fallback", async () => {
    // The send-po-email queue has an inline fallback when REDIS_URL is unset
    // (which it is, in vitest). We don't assert the disk email here — that's
    // covered exhaustively by po-email.spec.ts. We DO assert the audit row
    // records that the email was attempted with the right recipient, which
    // proves the controller plumbed `send_email` into the enqueue path.
    const id = await makeDraft({});
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ send_email: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ordered");
    const audit = await readAuditLog(t.tenantId, "purchase_order_ordered");
    const matching = audit.find(
      (a) =>
        (a.after as { sent_email?: boolean; recipient?: string } | null)?.recipient ===
        "sm-supplier@example.test",
    );
    expect(matching).toBeDefined();
    expect((matching!.after as { sent_email: boolean }).sent_email).toBe(true);
  });

  it("send_email=true with no supplier email: audit records sent_email=false (no error)", async () => {
    const id = await makeDraft({ supplier: supplierNoEmailId });
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ send_email: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ordered");
    const audit = await readAuditLog(t.tenantId, "purchase_order_ordered");
    const last = audit[0]!;
    expect((last.after as { sent_email: boolean; recipient: string | null })).toMatchObject({
      sent_email: false,
      recipient: null,
    });
  });

  it("ordered → received: writes one stock_movement(kind=receive) per qty>0 line + bumps branch_stock", async () => {
    const id = await makeDraft({
      productIndex: 0,
      qty: 7,
      unitCost: 1000,
      extraLines: [{ productIndex: 1, qty: 3, unitCost: 2000 }],
    });
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    const detail = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const beforeQty0 = (await readBranchStock(t.tenantId, t.branchId, t.products[0]!.id)) ?? 0;
    const beforeQty1 = (await readBranchStock(t.tenantId, t.branchId, t.products[1]!.id)) ?? 0;

    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        lines: detail.body.lines.map((l: { id: string; qty_ordered: number }) => ({
          line_id: l.id,
          qty_received: l.qty_ordered,
        })),
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("received");
    expect(res.body.has_discrepancy).toBe(false);
    expect(res.body.received_at).toBeTruthy();

    const afterQty0 = (await readBranchStock(t.tenantId, t.branchId, t.products[0]!.id)) ?? 0;
    const afterQty1 = (await readBranchStock(t.tenantId, t.branchId, t.products[1]!.id)) ?? 0;
    expect(afterQty0).toBe(beforeQty0 + 7);
    expect(afterQty1).toBe(beforeQty1 + 3);

    const movements0 = await readStockMovements(t.tenantId, t.products[0]!.id);
    expect(
      movements0.some(
        (m) =>
          m.kind === "receive" &&
          m.qty_delta === 7 &&
          m.reference_table === "purchase_orders",
      ),
    ).toBe(true);
    const movements1 = await readStockMovements(t.tenantId, t.products[1]!.id);
    expect(
      movements1.some(
        (m) =>
          m.kind === "receive" &&
          m.qty_delta === 3 &&
          m.reference_table === "purchase_orders",
      ),
    ).toBe(true);
  });

  it("received with short-receive: line gets auto_short note + has_discrepancy=true", async () => {
    const id = await makeDraft({ productIndex: 0, qty: 10, unitCost: 500 });
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    const detail = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const lineId = detail.body.lines[0].id as string;
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: lineId, qty_received: 7 }] });
    expect(res.status).toBe(200);
    expect(res.body.has_discrepancy).toBe(true);
    expect(res.body.lines[0].discrepancy_note).toBe("auto_short");
    expect(res.body.lines[0].qty_received).toBe(7);
  });

  it("received with over-receive: line gets auto_over note + has_discrepancy=true", async () => {
    const id = await makeDraft({ productIndex: 0, qty: 4, unitCost: 500 });
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    const detail = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const lineId = detail.body.lines[0].id as string;
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: lineId, qty_received: 6 }] });
    expect(res.status).toBe(200);
    expect(res.body.has_discrepancy).toBe(true);
    expect(res.body.lines[0].discrepancy_note).toBe("auto_over");
  });

  it("receive 422 incomplete_receive when not all lines included", async () => {
    const id = await makeDraft({
      productIndex: 0,
      qty: 1,
      unitCost: 100,
      extraLines: [{ productIndex: 1, qty: 2, unitCost: 200 }],
    });
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    const detail = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const firstLineId = detail.body.lines[0].id as string;
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: firstLineId, qty_received: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("incomplete_receive");
  });

  it("receive 422 unknown_line when an alien line_id is supplied", async () => {
    const id = await makeDraft({ productIndex: 0, qty: 1, unitCost: 100 });
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: randomUUID(), qty_received: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_line");
  });

  it("receive 409 not_ordered when called from draft", async () => {
    const id = await makeDraft({});
    const detail = await request(booted.http)
      .get(`/v1/purchase-orders/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const lineId = detail.body.lines[0].id as string;
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: lineId, qty_received: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_ordered");
  });

  it("cancel from draft: status → cancelled + audit", async () => {
    const id = await makeDraft({});
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(res.body.cancelled_at).toBeTruthy();
    const audit = await readAuditLog(t.tenantId, "purchase_order_cancelled");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("cancel 409 not_draft once status='ordered'", async () => {
    const id = await makeDraft({});
    await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_draft");
  });
});
