import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, readAuditLog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("Stock-transfer CRUD (POST/PATCH/GET/DELETE /v1/stock-transfers)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let secondBranchId: string;
  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "xfer-crud" });
    ownerToken = (await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    cashierToken = (await tokens.mintPair({ userId: cashier.id, tenantId: t.tenantId, role: "cashier" })).access_token;

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

  it("POST happy: owner creates a draft transfer with multiple lines + audit", async () => {
    const res = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: secondBranchId,
        notes: "Restock the new branch",
        lines: [
          { product_id: t.products[0]!.id, qty_sent: 5 },
          { product_id: t.products[1]!.id, qty_sent: 3 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^TXR-/);
    expect(res.body.status).toBe("draft");
    expect(res.body.line_count).toBe(2);
    expect(res.body.total_qty_sent).toBe(8);
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.has_discrepancy).toBe(false);
    const audit = await readAuditLog(t.tenantId, "stock_transfer_created");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("POST rejects same-branch source and destination (400)", async () => {
    const res = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: t.branchId,
        lines: [{ product_id: t.products[0]!.id, qty_sent: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it("POST rejects unknown product (422)", async () => {
    const res = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: secondBranchId,
        lines: [{ product_id: randomUUID(), qty_sent: 1 }],
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_product");
  });

  it("POST rejects duplicate product across lines (400)", async () => {
    const res = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: secondBranchId,
        lines: [
          { product_id: t.products[0]!.id, qty_sent: 1 },
          { product_id: t.products[0]!.id, qty_sent: 2 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("duplicate_product");
  });

  it("POST as cashier returns 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: t.branchId,
        to_branch_id: secondBranchId,
        lines: [{ product_id: t.products[0]!.id, qty_sent: 1 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("PATCH updates draft lines + notes", async () => {
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
    const res = await request(booted.http)
      .patch(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        notes: "Updated note",
        lines: [
          { product_id: t.products[0]!.id, qty_sent: 4 },
          { product_id: t.products[2]!.id, qty_sent: 2 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Updated note");
    expect(res.body.line_count).toBe(2);
    expect(res.body.total_qty_sent).toBe(6);
  });

  it("DELETE soft-deletes a draft + idempotent", async () => {
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
    const r1 = await request(booted.http)
      .delete(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.deleted_at).toBeTruthy();
    const r2 = await request(booted.http)
      .delete(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r2.status).toBe(200);
  });

  it("GET list filters by status", async () => {
    const res = await request(booted.http)
      .get("/v1/stock-transfers?status=draft")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: { status: string }) => r.status === "draft")).toBe(true);
  });
});
