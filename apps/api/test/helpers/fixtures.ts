import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { adminPrisma } from "@madar/db";

/**
 * The production signup service hardcodes plan code "starter" — fixtures must
 * match that exact code (see apps/api/src/tenant/auth/auth.service.ts:26).
 */
export const STARTER_PLAN_CODE = "starter";

const ARGON2_PARAMS = {
  type: 2 as const,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

export async function seedStarterPlan(): Promise<{ id: string; code: string }> {
  const plan = await adminPrisma.plan.upsert({
    where: { code: STARTER_PLAN_CODE },
    update: {},
    create: {
      code: STARTER_PLAN_CODE,
      name_i18n: { en: "Starter", ar: "البداية" },
      monthly_price_cents: 4900n,
      currency_code: "USD",
      limits: { txns: 5000, users: 5, branches: 1, storage_gb: 5 },
    },
  });
  return { id: plan.id, code: plan.code };
}

/**
 * Generate a unique slug for the given namespace plus a short random suffix so
 * specs running in the same process never collide on the unique-slug constraint.
 */
export function uniqueSlug(prefix: string): string {
  const suffix = randomUUID().slice(0, 8);
  return `${prefix.toLowerCase()}-${suffix}`;
}

export function uniqueEmail(prefix: string): string {
  const suffix = randomUUID().slice(0, 8);
  return `${prefix.toLowerCase()}-${suffix}@example.test`;
}

export interface TenantFixture {
  tenantId: string;
  userId: string;
  email: string;
  password: string;
  slug: string;
  planId: string;
}

/**
 * Create a tenant + owner user via adminPrisma (RLS bypass) for tests that
 * need an existing account to log in / refresh / hit /me / logout.
 *
 * Mirrors what AuthService.signup writes: status='trialing', role='owner',
 * argon2 hash with the same params, locale='en'.
 */
export async function makeTenant(opts?: {
  slugPrefix?: string;
  emailPrefix?: string;
  password?: string;
  status?: "trialing" | "active" | "grace_period" | "suspended" | "cancelled";
}): Promise<TenantFixture> {
  const plan = await seedStarterPlan();
  const slug = uniqueSlug(opts?.slugPrefix ?? "shop");
  const email = uniqueEmail(opts?.emailPrefix ?? "owner");
  const password = opts?.password ?? "Password123!";
  const password_hash = await argon2.hash(password, ARGON2_PARAMS);

  const tenant = await adminPrisma.tenant.create({
    data: {
      slug,
      name: `Test Shop ${slug}`,
      name_i18n: { en: `Test Shop ${slug}`, ar: `Test Shop ${slug}` },
      country_code: "EG",
      default_currency_code: "USD",
      default_locale: "en",
      plan_id: plan.id,
      status: opts?.status ?? "trialing",
      trial_ends_at: new Date(Date.now() + 14 * 86400 * 1000),
    },
  });

  const user = await adminPrisma.user.create({
    data: {
      tenant_id: tenant.id,
      email,
      password_hash,
      name: "Test Owner",
      role: "owner",
      locale: "en",
      is_active: true,
    },
  });

  return {
    tenantId: tenant.id,
    userId: user.id,
    email,
    password,
    slug,
    planId: plan.id,
  };
}

/**
 * Read audit_log rows for a tenant via adminPrisma (RLS bypass) so tests can
 * assert that the right action rows were appended. Newest first.
 */
export async function readAuditLog(
  tenantId: string,
  action?: string,
): Promise<
  Array<{
    action: string;
    entity: string;
    user_id: string | null;
    before: unknown;
    after: unknown;
  }>
> {
  const rows = await adminPrisma.auditLog.findMany({
    where: { tenant_id: tenantId, ...(action ? { action } : {}) },
    orderBy: { created_at: "desc" },
    select: { action: true, entity: true, user_id: true, before: true, after: true },
  });
  return rows;
}

export async function setTenantStatus(
  tenantId: string,
  status: "trialing" | "active" | "grace_period" | "suspended" | "cancelled",
): Promise<void> {
  await adminPrisma.tenant.update({ where: { id: tenantId }, data: { status } });
}

export interface CatalogProductFixture {
  id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  price_cents: bigint;
  cost_cents: bigint;
  starting_qty: number;
}

export interface TenantWithCatalogFixture extends TenantFixture {
  branchId: string;
  products: CatalogProductFixture[];
}

/**
 * Build a tenant with one branch, a cashier-owner user, and N products that
 * already have BranchStock rows. Used by the sales test suite — every spec
 * needs a tenant with stock to sell.
 *
 * The products list is the SAME order/values across specs unless overridden,
 * so assertions about line totals are predictable.
 */
export async function makeTenantWithCatalog(opts?: {
  slugPrefix?: string;
  emailPrefix?: string;
  products?: Array<{
    sku?: string;
    name?: string;
    price_cents: bigint;
    cost_cents: bigint;
    starting_qty?: number;
  }>;
}): Promise<TenantWithCatalogFixture> {
  const base = await makeTenant({
    slugPrefix: opts?.slugPrefix ?? "sales",
    emailPrefix: opts?.emailPrefix ?? "cashier",
  });

  const branch = await adminPrisma.branch.create({
    data: {
      tenant_id: base.tenantId,
      code: `BR-${randomUUID().slice(0, 6)}`,
      name_i18n: { en: "Main", ar: "الرئيسي" },
      currency_code: "USD",
    },
  });

  const specs =
    opts?.products ?? [
      { price_cents: 3500n, cost_cents: 1200n, starting_qty: 20 },
      { price_cents: 7000n, cost_cents: 2200n, starting_qty: 15 },
      { price_cents: 4500n, cost_cents: 1400n, starting_qty: 10 },
    ];

  const products: CatalogProductFixture[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    const sku = s.sku ?? `SKU-${randomUUID().slice(0, 6)}-${i + 1}`;
    const name = s.name ?? `Test Product ${i + 1}`;
    const startingQty = s.starting_qty ?? 10;
    const product = await adminPrisma.product.create({
      data: {
        tenant_id: base.tenantId,
        sku,
        name_i18n: { en: name, ar: name },
        price_cents: s.price_cents,
        cost_cents: s.cost_cents,
        currency_code: "USD",
        is_active: true,
      },
    });
    await adminPrisma.branchStock.create({
      data: {
        tenant_id: base.tenantId,
        branch_id: branch.id,
        product_id: product.id,
        qty_on_hand: startingQty,
      },
    });
    products.push({
      id: product.id,
      sku,
      name_i18n: { en: name, ar: name },
      price_cents: s.price_cents,
      cost_cents: s.cost_cents,
      starting_qty: startingQty,
    });
  }

  return { ...base, branchId: branch.id, products };
}

/**
 * Read a sale + its lines via adminPrisma (RLS bypass) for assertions.
 */
export async function readSaleWithLines(saleId: string): Promise<{
  sale: {
    id: string;
    code: string;
    payment_status: string;
    payment_method: string;
    total_cents: bigint;
    subtotal_cents: bigint;
    discount_cents: bigint;
    client_uuid: string;
  };
  lines: Array<{
    product_id: string;
    qty: number;
    unit_price_cents: bigint;
    discount_cents: bigint;
    line_total_cents: bigint;
    cogs_snapshot_cents: bigint;
  }>;
} | null> {
  const sale = await adminPrisma.sale.findUnique({
    where: { id: saleId },
    include: { lines: true },
  });
  if (!sale) return null;
  return {
    sale: {
      id: sale.id,
      code: sale.code,
      payment_status: sale.payment_status,
      payment_method: sale.payment_method,
      total_cents: sale.total_cents,
      subtotal_cents: sale.subtotal_cents,
      discount_cents: sale.discount_cents,
      client_uuid: sale.client_uuid,
    },
    lines: sale.lines.map((l) => ({
      product_id: l.product_id,
      qty: l.qty,
      unit_price_cents: l.unit_price_cents,
      discount_cents: l.discount_cents,
      line_total_cents: l.line_total_cents,
      cogs_snapshot_cents: l.cogs_snapshot_cents,
    })),
  };
}

export async function readStockMovements(
  tenantId: string,
  productId: string,
): Promise<Array<{ kind: string; qty_delta: number; reference_table: string | null }>> {
  return adminPrisma.stockMovement.findMany({
    where: { tenant_id: tenantId, product_id: productId },
    orderBy: { created_at: "desc" },
    select: { kind: true, qty_delta: true, reference_table: true },
  });
}

export async function readBranchStock(
  tenantId: string,
  branchId: string,
  productId: string,
): Promise<number | null> {
  const row = await adminPrisma.branchStock.findUnique({
    where: {
      tenant_id_branch_id_product_id: {
        tenant_id: tenantId,
        branch_id: branchId,
        product_id: productId,
      },
    },
  });
  return row?.qty_on_hand ?? null;
}

// ─── Bank accounts + subscription invoices (for payment-proof tests) ──

export async function makeTenantBankAccount(
  tenantId: string,
  opts?: { currencyCode?: string; name?: string },
): Promise<{ id: string }> {
  const row = await adminPrisma.tenantBankAccount.create({
    data: {
      tenant_id: tenantId,
      name_i18n: { en: opts?.name ?? "Test Bank Account", ar: opts?.name ?? "Test Bank Account" },
      bank_name: "Commercial International Bank",
      account_holder: "Test Holder",
      account_number_last4: "1234",
      account_number_encrypted: "encrypted-fake",
      currency_code: opts?.currencyCode ?? "USD",
    },
  });
  return { id: row.id };
}

const TEST_PLATFORM_BANK_ID = "00000000-0000-0000-0000-000000000fff";

export async function makePlatformBankAccount(opts?: {
  currencyCode?: string;
  countryCode?: string;
}): Promise<{ id: string }> {
  const row = await adminPrisma.platformBankAccount.upsert({
    where: { id: TEST_PLATFORM_BANK_ID },
    update: {},
    create: {
      id: TEST_PLATFORM_BANK_ID,
      name_i18n: { en: "Test Platform Account", ar: "حساب اختبار" },
      bank_name: "Test Bank",
      account_holder: "Madar Platform",
      account_number_last4: "9999",
      account_number_encrypted: "encrypted-fake",
      currency_code: opts?.currencyCode ?? "USD",
      country_code: opts?.countryCode ?? "EG",
    },
  });
  return { id: row.id };
}

export async function makeSubscriptionInvoice(
  tenantId: string,
  planId: string,
  opts?: {
    amountCents?: bigint;
    currencyCode?: string;
    status?: "draft" | "awaiting_payment" | "in_review" | "paid" | "overdue" | "cancelled";
    dueDate?: Date;
  },
): Promise<{ id: string }> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86_400_000);
  const due = opts?.dueDate ?? new Date(now.getTime() + 7 * 86_400_000);
  const row = await adminPrisma.subscriptionInvoice.create({
    data: {
      tenant_id: tenantId,
      plan_id: planId,
      period_start: now,
      period_end: periodEnd,
      due_date: due,
      amount_cents: opts?.amountCents ?? 4900n,
      currency_code: opts?.currencyCode ?? "USD",
      status: opts?.status ?? "awaiting_payment",
      reference_code: `INV-${randomUUID().slice(0, 8)}`,
    },
  });
  return { id: row.id };
}

/** Return the latest payment_audit rows for a tenant (via adminPrisma). */
export async function readPaymentProofRow(proofId: string): Promise<{
  id: string;
  status: string;
  rejection_reason: string | null;
  verified_by: string | null;
  receipt_image_url: string;
} | null> {
  const row = await adminPrisma.paymentProof.findUnique({ where: { id: proofId } });
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    rejection_reason: row.rejection_reason,
    verified_by: row.verified_by,
    receipt_image_url: row.receipt_image_url,
  };
}
