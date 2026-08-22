import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";
import { QuotationsService } from "../../src/tenant/quotations/quotations.service";

describe("Quotations (/v1/quotations)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let ownerUserId: string;
  let cashierAId: string;
  let cashierAToken: string;
  let cashierBId: string;
  let cashierBToken: string;
  let otherTenant: TenantWithCatalogFixture;
  let otherOwnerToken: string;

  async function createQuote(opts: {
    token: string;
    productId: string;
    branchId?: string;
    customerId?: string | null;
    validDays?: number;
    unitPriceCents?: string;
  }): Promise<{ status: number; body: { id?: string; [k: string]: unknown } }> {
    const body: Record<string, unknown> = {
      branch_id: opts.branchId ?? t.branchId,
      note: "walk-in",
      customer_id: opts.customerId ?? null,
      currency_code: "USD",
      subtotal_cents: "3500",
      discount_cents: "0",
      tax_cents: "0",
      total_cents: "3500",
      lines: [
        {
          product_id: opts.productId,
          qty: 1,
          unit_price_cents: opts.unitPriceCents ?? "3500",
          discount_cents: "0",
          note: null,
        },
      ],
    };
    if (opts.validDays !== undefined) body.valid_days = opts.validDays;
    const res = await request(booted.http)
      .post("/v1/quotations")
      .set("Authorization", `Bearer ${opts.token}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
    return { status: res.status, body: res.body };
  }

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({
      slugPrefix: "quote",
      products: [
        { price_cents: 3500n, cost_cents: 1200n, starting_qty: 20 },
        { price_cents: 7000n, cost_cents: 2200n, starting_qty: 15 },
        { price_cents: 4500n, cost_cents: 1400n, starting_qty: 10 },
        { price_cents: 5500n, cost_cents: 1600n, starting_qty: 10 },
        { price_cents: 6500n, cost_cents: 1800n, starting_qty: 10 },
      ],
    });
    ownerUserId = t.userId;
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const cA = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashA-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier A",
        role: "cashier",
        branch_id: t.branchId,
        locale: "en",
      },
    });
    cashierAId = cA.id;
    cashierAToken = (
      await tokens.mintPair({ userId: cA.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    const cB = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashB-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier B",
        role: "cashier",
        branch_id: t.branchId,
        locale: "en",
      },
    });
    cashierBId = cB.id;
    cashierBToken = (
      await tokens.mintPair({ userId: cB.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    otherTenant = await makeTenantWithCatalog({ slugPrefix: "quote-rls" });
    otherOwnerToken = (
      await tokens.mintPair({
        userId: otherTenant.userId,
        tenantId: otherTenant.tenantId,
        role: "owner",
      })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("create returns a QT- code, persists line snapshots, valid_until ~ now+14d by default", async () => {
    const product = t.products[0]!;
    const before = Date.now();
    const created = await createQuote({ token: cashierAToken, productId: product.id });
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^QT-[0-9A-Z]{6,}$/);
    const lines = created.body.lines as Array<{
      product_id: string;
      name_i18n: { en: string; ar: string };
      sku: string | null;
    }>;
    expect(lines.length).toBe(1);
    expect(lines[0]!.product_id).toBe(product.id);
    expect(lines[0]!.name_i18n.en).toBe(product.name_i18n.en);
    expect(lines[0]!.sku).toBe(product.sku);

    const validUntil = new Date(created.body.valid_until as string).getTime();
    const expected = before + 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(validUntil - expected)).toBeLessThan(60_000);

    const audit = await readAuditLog(t.tenantId, "quotation_created");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("custom valid_days=30 respected; valid_days=0 or 91 rejected with 400", async () => {
    const product = t.products[1]!;
    const before = Date.now();
    const created = await createQuote({
      token: cashierAToken,
      productId: product.id,
      validDays: 30,
    });
    expect(created.status).toBe(201);
    const validUntil = new Date(created.body.valid_until as string).getTime();
    const expected = before + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(validUntil - expected)).toBeLessThan(60_000);

    const zero = await createQuote({ token: cashierAToken, productId: product.id, validDays: 0 });
    expect(zero.status).toBe(400);

    const over = await createQuote({
      token: cashierAToken,
      productId: product.id,
      validDays: 91,
    });
    expect(over.status).toBe(400);
  });

  it("list shows effective_status expired for a backdated quote", async () => {
    const product = t.products[2]!;
    const created = await createQuote({ token: cashierAToken, productId: product.id });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    await adminPrisma.quotation.update({
      where: { id },
      data: { valid_until: new Date(Date.now() - 60_000) },
    });

    const list = await request(booted.http)
      .get(`/v1/quotations?branch_id=${t.branchId}&status=expired`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(list.status).toBe(200);
    const found = (
      list.body.items as Array<{ id: string; effective_status: string; status: string }>
    ).find((i) => i.id === id);
    expect(found).toBeTruthy();
    expect(found!.effective_status).toBe("expired");
    expect(found!.status).toBe("open");
  });

  it("detail renders lines from the snapshot after the product is soft-deleted", async () => {
    const product = t.products[3]!;
    const created = await createQuote({ token: cashierAToken, productId: product.id });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    await adminPrisma.product.update({
      where: { id: product.id },
      data: { deleted_at: new Date() },
    });

    const detail = await request(booted.http)
      .get(`/v1/quotations/${id}`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(detail.status).toBe(200);
    const lines = detail.body.lines as Array<{ product_id: string; sku: string | null }>;
    expect(lines.length).toBe(1);
    expect(lines[0]!.product_id).toBe(product.id);
    expect(lines[0]!.sku).toBe(product.sku);
  });

  it("cancel: open→cancelled; second cancel idempotent 200; cancel of converted → 409", async () => {
    const product = t.products[4]!;
    const created = await createQuote({ token: cashierAToken, productId: product.id });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const cancel1 = await request(booted.http)
      .post(`/v1/quotations/${id}/cancel`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(cancel1.status).toBe(200);
    expect(cancel1.body.status).toBe("cancelled");

    const audit = await readAuditLog(t.tenantId, "quotation_cancelled");
    expect(audit.length).toBeGreaterThan(0);

    const cancel2 = await request(booted.http)
      .post(`/v1/quotations/${id}/cancel`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(cancel2.status).toBe(200);
    expect(cancel2.body.status).toBe("cancelled");

    // Fake a converted quote to test the 409 path.
    const created2 = await createQuote({ token: cashierAToken, productId: product.id });
    const id2 = created2.body.id as string;
    await adminPrisma.quotation.update({
      where: { id: id2 },
      data: { status: "converted", converted_at: new Date() },
    });
    const cancelConverted = await request(booted.http)
      .post(`/v1/quotations/${id2}/cancel`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    expect(cancelConverted.status).toBe(409);
    expect(cancelConverted.body.code).toBe("quotation_not_open");
  });

  it("cashier cannot cancel another cashier's quote (403); manager (owner) can", async () => {
    const product = t.products[0]!;
    const created = await createQuote({ token: cashierAToken, productId: product.id });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const forbidden = await request(booted.http)
      .post(`/v1/quotations/${id}/cancel`)
      .set("Authorization", `Bearer ${cashierBToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("forbidden_not_owner");

    const ownerCancel = await request(booted.http)
      .post(`/v1/quotations/${id}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerCancel.status).toBe(200);

    expect(ownerUserId).toEqual(t.userId);
    expect(cashierBId).not.toBe(cashierAId);
  });

  it("getOpenForConvert: expired throws quotation_expired; cancelled throws quotation_not_open", async () => {
    const svc = booted.app.get(QuotationsService);
    const product = t.products[1]!;

    const expiredQuote = await createQuote({ token: cashierAToken, productId: product.id });
    const expiredId = expiredQuote.body.id as string;
    await adminPrisma.quotation.update({
      where: { id: expiredId },
      data: { valid_until: new Date(Date.now() - 60_000) },
    });
    await expect(svc.getOpenForConvert(t.tenantId, expiredId)).rejects.toMatchObject({
      response: { code: "quotation_expired" },
    });

    const cancelledQuote = await createQuote({ token: cashierAToken, productId: product.id });
    const cancelledId = cancelledQuote.body.id as string;
    await request(booted.http)
      .post(`/v1/quotations/${cancelledId}/cancel`)
      .set("Authorization", `Bearer ${cashierAToken}`);
    await expect(svc.getOpenForConvert(t.tenantId, cancelledId)).rejects.toMatchObject({
      response: { code: "quotation_not_open" },
    });
  });

  it("RLS canary: tenant B can't see or act on tenant A's quotations", async () => {
    const product = t.products[0]!;
    const created = await createQuote({ token: ownerToken, productId: product.id });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const list = await request(booted.http)
      .get(`/v1/quotations?branch_id=${t.branchId}`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(list.status).toBe(200);
    const ids = (list.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(id);

    const detail = await request(booted.http)
      .get(`/v1/quotations/${id}`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(detail.status).toBe(404);
  });
});
