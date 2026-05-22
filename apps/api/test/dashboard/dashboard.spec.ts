import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeSubscriptionInvoice,
  makeTenant,
  makeTenantBankAccount,
  makeTenantWithCatalog,
} from "../helpers/fixtures";

/**
 * Helper — seed a paid sale at a chosen `occurred_at` so we can drive
 * this-week / prev-week / heatmap windows from the test side.
 */
async function seedSale(opts: {
  tenantId: string;
  branchId: string;
  cashierId: string | null;
  productId: string;
  qty: number;
  unitPriceCents: bigint;
  cogsCents: bigint;
  occurredAt: Date;
  currencyCode?: string;
  paymentStatus?: "paid" | "payment_pending" | "disputed" | "refunded";
  paymentMethod?: "cash" | "card" | "bank_transfer" | "store_credit" | "split";
}) {
  const total = opts.unitPriceCents * BigInt(opts.qty);
  const sale = await adminPrisma.sale.create({
    data: {
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      code: `TX-${randomUUID().slice(0, 6).toUpperCase()}`,
      cashier_id: opts.cashierId ?? opts.tenantId, // placeholder uuid; never read
      subtotal_cents: total,
      total_cents: total,
      currency_code: opts.currencyCode ?? "USD",
      payment_method: opts.paymentMethod ?? "cash",
      payment_status: opts.paymentStatus ?? "paid",
      client_uuid: randomUUID(),
      occurred_at: opts.occurredAt,
    },
  });
  await adminPrisma.saleLine.create({
    data: {
      tenant_id: opts.tenantId,
      sale_id: sale.id,
      product_id: opts.productId,
      qty: opts.qty,
      unit_price_cents: opts.unitPriceCents,
      line_total_cents: total,
      cogs_snapshot_cents: opts.cogsCents,
    },
  });
  return sale;
}

describe("GET /v1/dashboard — chain-wide owner dashboard", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  // ─── role gate ──────────────────────────────────────────────────────

  it("returns 403 for a cashier", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "dash-cashier" });
    const cashier = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "cashier",
    });
    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${cashier.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("returns 200 for an owner (reader role)", async () => {
    const t = await makeTenant({ slugPrefix: "dash-owner-200" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.currency_code).toBeDefined();
    expect(res.body.week).toBeDefined();
    expect(res.body.leaderboard).toBeDefined();
    expect(res.body.heatmap).toHaveLength(7);
    expect(res.body.heatmap[0]).toHaveLength(12);
  });

  // ─── multi-tenant isolation canary ──────────────────────────────────

  it("RLS canary: tenant B's dashboard does not surface tenant A's sales", async () => {
    const tA = await makeTenantWithCatalog({ slugPrefix: "dash-rls-a" });
    const tB = await makeTenant({ slugPrefix: "dash-rls-b" });
    const tokenA = (
      await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })
    ).access_token;
    const tokenB = (
      await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })
    ).access_token;

    // Heavy sale in tenant A — must NOT leak into tenant B's totals.
    await seedSale({
      tenantId: tA.tenantId,
      branchId: tA.branchId,
      cashierId: tA.userId,
      productId: tA.products[0]!.id,
      qty: 10,
      unitPriceCents: 99_000n,
      cogsCents: 50_000n,
      occurredAt: new Date(),
    });

    const resA = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${tokenA}`);
    const resB = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(Number(resA.body.week.revenue_cents)).toBeGreaterThanOrEqual(990_000);
    expect(resB.body.week.revenue_cents).toBe("0");
    expect(resB.body.week.transactions).toBe(0);
    expect(resB.body.leaderboard).toEqual([]);
  });

  // ─── empty tenant ───────────────────────────────────────────────────

  it("empty tenant: zeros throughout; insights contains week_recap only", async () => {
    const t = await makeTenant({ slugPrefix: "dash-empty" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.week.revenue_cents).toBe("0");
    expect(res.body.week.transactions).toBe(0);
    expect(res.body.week.items_sold).toBe(0);
    expect(res.body.week.gross_profit_cents).toBe("0");
    expect(res.body.week.avg_basket_cents).toBe("0");
    expect(res.body.vs_prev_week).toEqual({
      revenue_pct: null,
      transactions_pct: null,
      gross_profit_pct: null,
    });
    expect(res.body.revenue_30d).toHaveLength(30);
    expect(res.body.sparklines.revenue_cents).toHaveLength(7);
    expect(res.body.recent_transactions).toEqual([]);
    expect(res.body.mixed_currency_warning).toBe(false);
    expect(res.body.insights).toHaveLength(1);
    expect(res.body.insights[0].kind).toBe("week_recap");
    expect(res.body.insights[0].headline_i18n.en).toContain("Steady week");
    expect(res.body.insights[0].headline_i18n.ar).toContain("أسبوع ثابت");
  });

  // ─── single sale this week ──────────────────────────────────────────

  it("one sale today reflects in week.revenue_cents / transactions / items_sold", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "dash-one-sale" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!;
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 2,
      unitPriceCents: p.price_cents,
      cogsCents: p.cost_cents,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.week.revenue_cents).toBe(String(p.price_cents * 2n));
    expect(res.body.week.transactions).toBe(1);
    expect(res.body.week.items_sold).toBe(2);
    expect(Number(res.body.week.gross_profit_cents)).toBe(
      Number(p.price_cents * 2n) - Number(p.cost_cents * 2n),
    );
  });

  // ─── vs prev week pct ───────────────────────────────────────────────

  it("computes vs_prev_week.revenue_pct correctly across two weeks", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "dash-pct" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!;

    // Prev week: 1 unit at 1000 cents (anchor ~10 days ago).
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 1_000n,
      cogsCents: 400n,
      occurredAt: new Date(Date.now() - 10 * 86_400_000),
    });
    // This week: 1 unit at 1500 cents (anchor ~2 days ago) → +50%.
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 1_500n,
      cogsCents: 400n,
      occurredAt: new Date(Date.now() - 2 * 86_400_000),
    });

    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.week.revenue_cents).toBe("1500");
    expect(res.body.prev_week.revenue_cents).toBe("1000");
    expect(res.body.vs_prev_week.revenue_pct).toBe(50);
  });

  // ─── mixed currency ────────────────────────────────────────────────

  it("foreign-currency sale counts in transactions but not revenue; mixed_currency_warning=true", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "dash-mixed" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!;

    // One sale in default currency (USD).
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 5_000n,
      cogsCents: 1_000n,
      occurredAt: new Date(),
      currencyCode: "USD",
    });
    // One sale in AED — counts as a transaction but is excluded from revenue.
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 9_999n,
      cogsCents: 1_000n,
      occurredAt: new Date(),
      currencyCode: "AED",
    });

    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.currency_code).toBe("USD");
    expect(res.body.mixed_currency_warning).toBe(true);
    expect(res.body.week.transactions).toBe(2);
    expect(res.body.week.revenue_cents).toBe("5000");
  });

  // ─── leaderboard ordering ──────────────────────────────────────────

  it("leaderboard orders branches DESC by current-week revenue", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "dash-lb" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!;

    const b2 = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `LB-2-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Branch B", ar: "الفرع ب" },
        currency_code: "USD",
      },
    });
    const b3 = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `LB-3-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Branch C", ar: "الفرع ج" },
        currency_code: "USD",
      },
    });

    // Branch 1 (main): 3000, Branch B: 9000 (highest), Branch C: 1500 (lowest).
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 3_000n,
      cogsCents: 500n,
      occurredAt: new Date(),
    });
    await seedSale({
      tenantId: t.tenantId,
      branchId: b2.id,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 9_000n,
      cogsCents: 500n,
      occurredAt: new Date(),
    });
    await seedSale({
      tenantId: t.tenantId,
      branchId: b3.id,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 1_500n,
      cogsCents: 500n,
      occurredAt: new Date(),
    });

    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toHaveLength(3);
    expect(res.body.leaderboard[0].branch_id).toBe(b2.id);
    expect(res.body.leaderboard[0].revenue_cents).toBe("9000");
    expect(res.body.leaderboard[1].branch_id).toBe(t.branchId);
    expect(res.body.leaderboard[2].branch_id).toBe(b3.id);
    expect(res.body.leaderboard[2].revenue_cents).toBe("1500");
  });

  // ─── insight: branch_decline ───────────────────────────────────────

  it("branch_decline insight fires on a -15% week-over-week branch", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "dash-decline" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });
    const p = t.products[0]!;

    // Prev week 10_000, this week 8_500 → -15%.
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 10_000n,
      cogsCents: 2_000n,
      occurredAt: new Date(Date.now() - 10 * 86_400_000),
    });
    await seedSale({
      tenantId: t.tenantId,
      branchId: t.branchId,
      cashierId: t.userId,
      productId: p.id,
      qty: 1,
      unitPriceCents: 8_500n,
      cogsCents: 2_000n,
      occurredAt: new Date(Date.now() - 2 * 86_400_000),
    });

    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    const declineInsight = res.body.insights.find(
      (i: { kind: string }) => i.kind === "branch_decline",
    );
    expect(declineInsight).toBeDefined();
    expect(declineInsight.urgency).toBe("high");
    expect(declineInsight.headline_i18n.en).toContain("dropped");
    expect(declineInsight.actions[0].href).toBe(`/branches/${t.branchId}/dashboard`);
  });

  // ─── insight: stale_payment_proof ──────────────────────────────────

  it("stale_payment_proof fires when a pending proof's created_at is 49h ago", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "dash-stale" });
    const owner = await tokens.mintPair({
      userId: t.userId,
      tenantId: t.tenantId,
      role: "owner",
    });

    // Need a payment_proof — subscription context is simpler to wire (no sale FK enforcement).
    const bank = await makeTenantBankAccount(t.tenantId);
    const invoice = await makeSubscriptionInvoice(t.tenantId, t.planId);
    const proof = await adminPrisma.paymentProof.create({
      data: {
        tenant_id: t.tenantId,
        context: "subscription",
        reference_id: invoice.id,
        amount_cents: 4_900n,
        currency_code: "USD",
        bank_account_kind: "tenant",
        bank_account_id: bank.id,
        payer_name: "Stale Payer",
        transfer_date: new Date(),
        receipt_image_url: "tenants/x/payment-proofs/x.jpg",
        status: "pending",
      },
    });
    await adminPrisma.paymentProof.update({
      where: { id: proof.id },
      data: { created_at: new Date(Date.now() - 49 * 3_600 * 1000) },
    });

    const res = await request(booted.http)
      .get("/v1/dashboard")
      .set("Authorization", `Bearer ${owner.access_token}`);
    expect(res.status).toBe(200);
    const staleInsight = res.body.insights.find(
      (i: { kind: string }) => i.kind === "stale_payment_proof",
    );
    expect(staleInsight).toBeDefined();
    expect(staleInsight.urgency).toBe("high");
    expect(staleInsight.actions[0].href).toBe("/sales/verification");
    expect(staleInsight.headline_i18n.en).toContain("48 hours");
  });
});
