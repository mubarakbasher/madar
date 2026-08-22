import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  readSaleWithLines,
  readStockMovements,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

describe("POST /v1/sales — convert quotation", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({
      slugPrefix: "sale-from-quote",
      products: [
        { price_cents: 3500n, cost_cents: 1200n, starting_qty: 20 },
        { price_cents: 7000n, cost_cents: 2200n, starting_qty: 15 },
      ],
    });
    const pair = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
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

  async function createQuote(opts: {
    productId: string;
    unitPriceCents: string;
    validDays?: number;
    qty?: number;
  }): Promise<{ id: string; code: string }> {
    const qty = opts.qty ?? 1;
    const total = (BigInt(opts.unitPriceCents) * BigInt(qty)).toString();
    const body: Record<string, unknown> = {
      branch_id: t.branchId,
      note: null,
      customer_id: null,
      currency_code: "USD",
      subtotal_cents: total,
      discount_cents: "0",
      tax_cents: "0",
      total_cents: total,
      lines: [
        {
          product_id: opts.productId,
          qty,
          unit_price_cents: opts.unitPriceCents,
          discount_cents: "0",
          note: null,
        },
      ],
    };
    if (opts.validDays !== undefined) body.valid_days = opts.validDays;
    const res = await request(booted.http)
      .post("/v1/quotations")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(res.status).toBe(201);
    return { id: res.body.id, code: res.body.code };
  }

  it("converts at the quoted price even after the catalog price changed", async () => {
    const product = t.products[0]!;
    const quote = await createQuote({ productId: product.id, unitPriceCents: "3500" });

    // Raise the catalog price after the quote was made.
    await adminPrisma.product.update({
      where: { id: product.id },
      data: { price_cents: 5000n },
    });

    const clientUuid = randomUUID();
    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: clientUuid,
      client_sequence: 1,
      quotation_id: quote.id,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payment_method: "cash",
      cash_tendered_cents: 3500,
    });

    expect(res.status).toBe(201);
    expect(res.body.total_cents).toBe("3500");

    const stored = await readSaleWithLines(res.body.id);
    expect(stored!.lines[0]!.unit_price_cents).toBe(3500n);

    // Quotation stamped converted + converted_sale_id.
    const quoteRow = await adminPrisma.quotation.findUnique({ where: { id: quote.id } });
    expect(quoteRow!.status).toBe("converted");
    expect(quoteRow!.converted_sale_id).toBe(res.body.id);
    expect(quoteRow!.converted_at).not.toBeNull();

    // Audit entries: sale_completed carries quotation_id; quotation_converted written too.
    const saleAudit = await readAuditLog(t.tenantId, "sale_completed");
    expect((saleAudit[0]!.after as { quotation_id?: string }).quotation_id).toBe(quote.id);
    const quoteAudit = await readAuditLog(t.tenantId, "quotation_converted");
    expect(quoteAudit.length).toBeGreaterThan(0);
    expect(quoteAudit[0]!.entity).toBe("quotation");
    expect((quoteAudit[0]!.after as { sale_id?: string }).sale_id).toBe(res.body.id);
  });

  it("second convert attempt with a new client_uuid gets 409 quotation_not_open; replay with same client_uuid returns original sale", async () => {
    const product = t.products[0]!;
    const quote = await createQuote({ productId: product.id, unitPriceCents: "3500" });

    const clientUuid = randomUUID();
    const first = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: clientUuid,
      client_sequence: 1,
      quotation_id: quote.id,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payment_method: "cash",
      cash_tendered_cents: 3500,
    });
    expect(first.status).toBe(201);

    const second = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 2,
      quotation_id: quote.id,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payment_method: "cash",
      cash_tendered_cents: 3500,
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("quotation_not_open");

    // Replay with the SAME client_uuid returns the original sale (idempotency
    // check runs before quote validation).
    const replay = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: clientUuid,
      client_sequence: 1,
      quotation_id: quote.id,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payment_method: "cash",
      cash_tendered_cents: 3500,
    });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
  });

  it("expired quote → 409 quotation_expired, no sale row, no stock_movements", async () => {
    const product = t.products[1]!;
    const quote = await createQuote({
      productId: product.id,
      unitPriceCents: "7000",
      validDays: 1,
    });
    // Force it into the past directly — the DTO forbids valid_days < 1.
    await adminPrisma.quotation.update({
      where: { id: quote.id },
      data: { valid_until: new Date(Date.now() - 60_000) },
    });

    const before = await readStockMovements(t.tenantId, product.id);

    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      quotation_id: quote.id,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payment_method: "cash",
      cash_tendered_cents: 7000,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("quotation_expired");

    const after = await readStockMovements(t.tenantId, product.id);
    expect(after.length).toBe(before.length);
  });

  it("a cart line not present on the quote prices from the current catalog", async () => {
    const productA = t.products[0]!;
    const productB = t.products[1]!;
    const quote = await createQuote({ productId: productA.id, unitPriceCents: "3500" });

    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      quotation_id: quote.id,
      lines: [
        { product_id: productA.id, qty: 1, line_discount_cents: 0, note: null },
        { product_id: productB.id, qty: 1, line_discount_cents: 0, note: null },
      ],
      payment_method: "cash",
      cash_tendered_cents: 3500 + 7000,
    });
    expect(res.status).toBe(201);
    const stored = await readSaleWithLines(res.body.id);
    const lineA = stored!.lines.find((l) => l.product_id === productA.id)!;
    const lineB = stored!.lines.find((l) => l.product_id === productB.id)!;
    expect(lineA.unit_price_cents).toBe(3500n);
    expect(lineB.unit_price_cents).toBe(productB.price_cents);
  });

  it("conversion combined with on_account_cents works (partial credit sale from a quote)", async () => {
    const product = t.products[0]!;
    const quote = await createQuote({ productId: product.id, unitPriceCents: "3500" });

    // Owner acting as their own customer requires a customer_id for credit sales.
    const customer = await adminPrisma.customer.create({
      data: {
        tenant_id: t.tenantId,
        name: "Quote Customer",
      },
    });

    const res = await postSale({
      branch_id: t.branchId,
      customer_id: customer.id,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      quotation_id: quote.id,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payments: [{ method: "cash", amount_cents: 1000, cash_tendered_cents: 1000 }],
      on_account_cents: 2500,
    });
    expect(res.status).toBe(201);
    expect(res.body.total_cents).toBe("3500");
    expect(res.body.balance_due_cents).toBe("2500");

    const quoteRow = await adminPrisma.quotation.findUnique({ where: { id: quote.id } });
    expect(quoteRow!.status).toBe("converted");
  });

  it("quotation_id + offline_completed=true → 400", async () => {
    const product = t.products[0]!;
    const quote = await createQuote({ productId: product.id, unitPriceCents: "3500" });

    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      client_uuid: randomUUID(),
      client_sequence: 1,
      quotation_id: quote.id,
      offline_completed: true,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payment_method: "cash",
      cash_tendered_cents: 3500,
    });
    expect(res.status).toBe(400);
  });

  it("currency mismatch between sale and quote → 400 quotation_currency_mismatch", async () => {
    const product = t.products[0]!;
    const quote = await createQuote({ productId: product.id, unitPriceCents: "3500" });

    const res = await postSale({
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "EGP",
      client_uuid: randomUUID(),
      client_sequence: 1,
      quotation_id: quote.id,
      lines: [{ product_id: product.id, qty: 1, line_discount_cents: 0, note: null }],
      payment_method: "cash",
      cash_tendered_cents: 3500,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("quotation_currency_mismatch");
  });
});
