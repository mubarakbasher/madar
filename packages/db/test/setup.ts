import { execSync } from "node:child_process";
import { afterAll, beforeAll } from "vitest";
import { adminPrisma, basePrisma } from "../src/index";

/**
 * Vitest setup file — runs once per worker pool.
 *
 * 1. Resets the database (drops everything, re-applies migrations, no seed).
 * 2. Inserts two test tenants A and B with one fixture row per tenant-scoped
 *    model. All writes go through adminPrisma (RLS bypassed via the
 *    app.is_super_admin flag) so we can populate both tenants from one process.
 *
 * The full RLS isolation tests then run against the populated DB. We deliberately
 * skip the demo seed (`pnpm db:seed`) so the test fixtures are minimal and
 * predictable.
 */

export interface TestFixtures {
  tenantA: { id: string };
  tenantB: { id: string };
  plan: { id: string };
}

export const TENANT_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const TENANT_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeAll(async () => {
  // Reset and re-apply migrations from a clean slate.
  // --skip-seed because we want our minimal test fixtures, not the demo seed.
  execSync("pnpm exec prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });

  await seedTenantFixtures();
});

afterAll(async () => {
  await basePrisma.$disconnect();
});

async function seedTenantFixtures() {
  // ── Platform: plan ────────────────────────────────────────────────
  const plan = await adminPrisma.plan.upsert({
    where: { code: "test-plan" },
    update: {},
    create: {
      code: "test-plan",
      name_i18n: { en: "Test", ar: "اختبار" },
      monthly_price_cents: 1000n,
      currency_code: "USD",
      limits: {},
    },
  });

  // ── Two tenants ───────────────────────────────────────────────────
  for (const t of [
    { id: TENANT_A_ID, slug: "tenant-a", name: "Tenant A" },
    { id: TENANT_B_ID, slug: "tenant-b", name: "Tenant B" },
  ]) {
    await adminPrisma.tenant.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        slug: t.slug,
        name: t.name,
        name_i18n: { en: t.name, ar: t.name },
        country_code: "EG",
        default_currency_code: "EGP",
        default_locale: "en",
        plan_id: plan.id,
        status: "active",
      },
    });
  }

  // ── One fixture per tenant-scoped model, per tenant ──────────────
  for (const tenantId of [TENANT_A_ID, TENANT_B_ID]) {
    const suffix = tenantId.slice(0, 4);

    const user = await adminPrisma.user.create({
      data: {
        tenant_id: tenantId,
        email: `cashier-${suffix}@example.test`,
        password_hash: "hash",
        name: `Cashier ${suffix}`,
        role: "cashier",
      },
    });

    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: tenantId,
        code: `b-${suffix}`,
        name_i18n: { en: "Test Branch", ar: "فرع اختبار" },
        currency_code: "EGP",
      },
    });

    const category = await adminPrisma.category.create({
      data: {
        tenant_id: tenantId,
        code: `c-${suffix}`,
        name_i18n: { en: "Cat", ar: "فئة" },
      },
    });

    const product = await adminPrisma.product.create({
      data: {
        tenant_id: tenantId,
        sku: `SKU-${suffix}`,
        name_i18n: { en: "Product", ar: "منتج" },
        category_id: category.id,
        price_cents: 1000n,
        cost_cents: 400n,
        currency_code: "EGP",
      },
    });

    await adminPrisma.customer.create({
      data: {
        tenant_id: tenantId,
        name: `Customer ${suffix}`,
        phone: `+1000000${suffix}`,
        email: `customer-${suffix}@example.test`,
      },
    });

    const tba = await adminPrisma.tenantBankAccount.create({
      data: {
        tenant_id: tenantId,
        name_i18n: { en: "Bank", ar: "بنك" },
        bank_name: "Test Bank",
        account_holder: `Tenant ${suffix}`,
        account_number_last4: "1234",
        account_number_encrypted: "x",
        currency_code: "EGP",
      },
    });

    await adminPrisma.branchStock.create({
      data: {
        tenant_id: tenantId,
        branch_id: branch.id,
        product_id: product.id,
        qty_on_hand: 50,
      },
    });

    await adminPrisma.stockMovement.create({
      data: {
        tenant_id: tenantId,
        branch_id: branch.id,
        product_id: product.id,
        kind: "receive",
        qty_delta: 50,
      },
    });

    const sale = await adminPrisma.sale.create({
      data: {
        tenant_id: tenantId,
        branch_id: branch.id,
        code: `S-${suffix}`,
        cashier_id: user.id,
        subtotal_cents: 1000n,
        total_cents: 1000n,
        currency_code: "EGP",
        payment_method: "cash",
        payment_status: "paid",
        client_uuid: `00000000-0000-0000-0000-${suffix.padEnd(12, "0")}`,
      },
    });

    await adminPrisma.saleLine.create({
      data: {
        tenant_id: tenantId,
        sale_id: sale.id,
        product_id: product.id,
        qty: 1,
        unit_price_cents: 1000n,
        line_total_cents: 1000n,
        cogs_snapshot_cents: 400n,
      },
    });

    const invoice = await adminPrisma.subscriptionInvoice.create({
      data: {
        tenant_id: tenantId,
        plan_id: plan.id,
        period_start: new Date("2026-01-01"),
        period_end: new Date("2026-01-31"),
        due_date: new Date("2026-01-31"),
        amount_cents: 1000n,
        currency_code: "USD",
        reference_code: `INV-${suffix}`,
      },
    });

    await adminPrisma.paymentProof.create({
      data: {
        tenant_id: tenantId,
        context: "subscription",
        reference_id: invoice.id,
        amount_cents: 1000n,
        currency_code: "USD",
        bank_account_kind: "tenant",
        bank_account_id: tba.id,
        payer_name: `Payer ${suffix}`,
        transfer_date: new Date(),
        receipt_image_url: `tenants/${tenantId}/test.jpg`,
      },
    });

    await adminPrisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        action: "test",
        entity: "test",
        entity_id: user.id,
      },
    });

    // ── Suppliers slice (Phase 2.3) ──────────────────────────────────
    const supplier = await adminPrisma.supplier.create({
      data: {
        tenant_id: tenantId,
        code: `SUP-${suffix}`,
        name_i18n: { en: `Supplier ${suffix}`, ar: `مورد ${suffix}` },
        currency_code: "USD",
        created_by: user.id,
      },
    });

    await adminPrisma.supplierProduct.create({
      data: {
        tenant_id: tenantId,
        supplier_id: supplier.id,
        product_id: product.id,
        unit_cost_cents: 100n,
        currency_code: "USD",
      },
    });

    const po = await adminPrisma.purchaseOrder.create({
      data: {
        tenant_id: tenantId,
        code: `PO-${suffix}`,
        supplier_id: supplier.id,
        branch_id: branch.id,
        currency_code: "USD",
      },
    });

    await adminPrisma.purchaseOrderLine.create({
      data: {
        tenant_id: tenantId,
        po_id: po.id,
        product_id: product.id,
        qty_ordered: 1,
        unit_cost_cents: 100n,
        line_total_cents: 100n,
      },
    });

    const rma = await adminPrisma.supplierReturn.create({
      data: {
        tenant_id: tenantId,
        code: `RMA-${suffix}`,
        supplier_id: supplier.id,
        branch_id: branch.id,
        currency_code: "USD",
        reason: "rls test",
        total_cents: 0n,
      },
    });

    await adminPrisma.supplierReturnLine.create({
      data: {
        tenant_id: tenantId,
        return_id: rma.id,
        product_id: product.id,
        qty: 1,
        unit_cost_cents: 100n,
        line_total_cents: 100n,
      },
    });

    await adminPrisma.supplierDocument.create({
      data: {
        tenant_id: tenantId,
        supplier_id: supplier.id,
        kind: "contract",
        file_path: `tenants/${tenantId}/suppliers/${supplier.id}/contract.pdf`,
        original_filename: "rls.pdf",
        mime_type: "application/pdf",
        size_bytes: 100,
      },
    });

    // ── Tax classes (Phase 1.10c) ────────────────────────────────────
    await adminPrisma.taxClass.create({
      data: {
        tenant_id: tenantId,
        code: `TAX-${suffix}`,
        name_i18n: { en: "Standard", ar: "قياسي" },
        rate_bps: 1500,
      },
    });

    // ── Held sales (Phase 1.10d) ─────────────────────────────────────
    const heldSale = await adminPrisma.heldSale.create({
      data: {
        tenant_id: tenantId,
        branch_id: branch.id,
        cashier_id: user.id,
        name: `Held ${suffix}`,
        currency_code: "EGP",
        subtotal_cents: 1000n,
        total_cents: 1000n,
      },
    });

    await adminPrisma.heldSaleLine.create({
      data: {
        tenant_id: tenantId,
        held_sale_id: heldSale.id,
        product_id: product.id,
        qty: 1,
        unit_price_cents: 1000n,
      },
    });

    // ── Sync conflicts (Phase 2.3 — offline POS) ────────────────────
    await adminPrisma.syncConflict.create({
      data: {
        tenant_id: tenantId,
        conflict_kind: "negative_stock",
        reference_table: "sales",
        reference_id: product.id,
        details: { product_id: product.id, qty_on_hand_after: -1 },
        occurred_at: new Date(),
      },
    });

    // ── Scheduled reports (Phase 3) ──────────────────────────────────
    await adminPrisma.scheduledReport.create({
      data: {
        tenant_id: tenantId,
        name: `Weekly P&L ${suffix}`,
        report_kind: "pnl",
        cadence: "weekly",
        cron_pattern: "0 9 * * 1",
        params: { currency: "EGP" },
        recipients: ["owner@example.test"],
        format: "csv",
      },
    });
  }
}
