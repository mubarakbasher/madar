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

describe("Stock-transfer state machine (send / receive / cancel)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let secondBranchId: string;
  let ownerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "xfer-sm" });
    ownerToken = (await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })).access_token;
    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `B2-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Second", ar: "الثاني" },
        currency_code: "USD",
      },
    });
    secondBranchId = branch.id;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  async function makeDraft(qty: number): Promise<string> {
    const res = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: secondBranchId,
        lines: [{ product_id: t.products[0]!.id, qty_sent: qty }],
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("send: writes transfer_out + decrements sender branch_stock + status → in_transit", async () => {
    const id = await makeDraft(5);
    const before = (await readBranchStock(t.tenantId, t.branchId, t.products[0]!.id)) ?? 0;

    const res = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_transit");
    expect(res.body.sent_at).toBeTruthy();

    const after = (await readBranchStock(t.tenantId, t.branchId, t.products[0]!.id)) ?? 0;
    expect(after).toBe(before - 5);

    const movements = await readStockMovements(t.tenantId, t.products[0]!.id);
    expect(movements.some((m) => m.kind === "transfer_out" && m.qty_delta === -5)).toBe(true);
    const audit = await readAuditLog(t.tenantId, "stock_transfer_sent");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("receive happy: writes transfer_in + increments receiver branch_stock + status → received, no discrepancy", async () => {
    const id = await makeDraft(4);
    await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);

    const detail = await request(booted.http)
      .get(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const lineId = detail.body.lines[0].id as string;

    const beforeReceiver = (await readBranchStock(t.tenantId, secondBranchId, t.products[0]!.id)) ?? 0;
    const res = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: lineId, qty_received: 4 }] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("received");
    expect(res.body.has_discrepancy).toBe(false);

    const afterReceiver = (await readBranchStock(t.tenantId, secondBranchId, t.products[0]!.id)) ?? 0;
    expect(afterReceiver).toBe(beforeReceiver + 4);

    const movements = await readStockMovements(t.tenantId, t.products[0]!.id);
    expect(movements.some((m) => m.kind === "transfer_in" && m.qty_delta === 4)).toBe(true);
  });

  it("receive with discrepancy: line gets discrepancy_note, has_discrepancy=true, no auto-adjust at sender", async () => {
    const id = await makeDraft(10);
    await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);

    const detail = await request(booted.http)
      .get(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const lineId = detail.body.lines[0].id as string;

    const senderStockBeforeReceive = (await readBranchStock(t.tenantId, t.branchId, t.products[0]!.id)) ?? 0;
    const res = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        lines: [{ line_id: lineId, qty_received: 8, discrepancy_note: "2 units damaged in transit" }],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("received");
    expect(res.body.has_discrepancy).toBe(true);
    expect(res.body.lines[0].qty_received).toBe(8);
    expect(res.body.lines[0].discrepancy_note).toBe("2 units damaged in transit");

    // No auto-adjustment at sender — sender stock unchanged from after-send state.
    const senderStockAfterReceive = (await readBranchStock(t.tenantId, t.branchId, t.products[0]!.id)) ?? 0;
    expect(senderStockAfterReceive).toBe(senderStockBeforeReceive);
  });

  it("receive: rejected when not in_transit (e.g. still draft)", async () => {
    const id = await makeDraft(3);
    const detail = await request(booted.http)
      .get(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const lineId = detail.body.lines[0].id as string;
    const res = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: lineId, qty_received: 3 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("transfer_not_receivable");
  });

  it("receive: rejected when not every line is included (incomplete_receive)", async () => {
    const create = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: secondBranchId,
        lines: [
          { product_id: t.products[0]!.id, qty_sent: 1 },
          { product_id: t.products[1]!.id, qty_sent: 2 },
        ],
      });
    const id = create.body.id as string;
    await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const detail = await request(booted.http)
      .get(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const firstLineId = detail.body.lines[0].id as string;
    const res = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ lines: [{ line_id: firstLineId, qty_received: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("incomplete_receive");
  });

  it("send: empty transfer is 422 transfer_empty", async () => {
    // Create then patch to one line, then patch with empty would 400 (zod).
    // To actually reach transfer_empty, delete the line via direct DB write.
    const create = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: secondBranchId,
        lines: [{ product_id: t.products[0]!.id, qty_sent: 1 }],
      });
    const id = create.body.id as string;
    await adminPrisma.stockTransferLine.deleteMany({ where: { transfer_id: id } });
    const res = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("transfer_empty");
  });

  it("cancel: only allowed from draft", async () => {
    const id = await makeDraft(1);
    const r1 = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe("cancelled");

    // Sending a cancelled transfer 409 transfer_not_sendable
    const r2 = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r2.status).toBe(409);
  });

  it("cancel: rejected from in_transit (must adjust manually)", async () => {
    const id = await makeDraft(1);
    await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const res = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("transfer_not_cancellable");
  });

  it("PATCH refused once transfer left draft (409 transfer_not_editable)", async () => {
    const id = await makeDraft(1);
    await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const res = await request(booted.http)
      .patch(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ notes: "too late" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("transfer_not_editable");
  });
});
