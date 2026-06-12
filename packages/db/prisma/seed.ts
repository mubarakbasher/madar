import "./env-prelude";
import argon2 from "argon2";
import { adminPrisma } from "../src/admin";
import {
  BRANCHES,
  CUSTOMERS,
  PRODUCT_CATEGORIES,
  PRODUCTS,
  SAMPLE_SALE,
  STAFF,
} from "./seed-data";

// Seeds run as the non-superuser `madar_admin` connection role (ADR 0004):
// its admin_full_access RLS policy lets writes through into both
// tenant-scoped and platform tables — no session-variable bypass exists.
const prisma = adminPrisma;

// Static demo TOTP secret (32 bytes base32) — stable across re-seeds so the QR
// the user scanned the first time keeps working. Replace in production.
const DEMO_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

async function main() {
  console.log("🌱 Seeding Madar demo data …");

  // ── 1. Plans ─────────────────────────────────────────────────────
  const plans = await Promise.all(
    [
      { code: "starter", price: 4900, limits: { txns: 5000, users: 5, branches: 1, storage_gb: 5 } },
      { code: "growth", price: 14900, limits: { txns: 20000, users: 20, branches: 5, storage_gb: 25 } },
      { code: "business", price: 39900, limits: { txns: 100000, users: 100, branches: 25, storage_gb: 100 } },
      { code: "enterprise", price: 99900, limits: { txns: -1, users: -1, branches: -1, storage_gb: 500 } },
    ].map((p) =>
      prisma.plan.upsert({
        where: { code: p.code },
        update: {},
        create: {
          code: p.code,
          name_i18n: {
            en: p.code.charAt(0).toUpperCase() + p.code.slice(1),
            ar:
              p.code === "starter" ? "البداية"
              : p.code === "growth" ? "النمو"
              : p.code === "business" ? "الأعمال"
              : "المؤسسات",
          },
          monthly_price_cents: BigInt(p.price),
          currency_code: "USD",
          limits: p.limits,
        },
      }),
    ),
  );
  console.log(`  ✓ ${plans.length} plans`);
  const growthPlan = plans.find((p) => p.code === "growth")!;

  // ── 2. Super-admin ───────────────────────────────────────────────
  const adminUser = await prisma.platformUser.upsert({
    where: { email: "admin@platform.test" },
    update: {},
    create: {
      email: "admin@platform.test",
      password_hash: await argon2.hash("Admin123!"),
      name: "Platform Admin",
      role: "owner",
      mfa_secret: DEMO_ADMIN_TOTP_SECRET,
      mfa_enabled: true,
    },
  });
  console.log(`  ✓ Super-admin: admin@platform.test / Admin123!`);
  const otpauthUrl = `otpauth://totp/Madar:admin@platform.test?secret=${DEMO_ADMIN_TOTP_SECRET}&issuer=Madar&algorithm=SHA1&digits=6&period=30`;
  console.log(`    TOTP: ${otpauthUrl}`);

  // ── 3. Platform bank account ─────────────────────────────────────
  const platformBank = await prisma.platformBankAccount.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name_i18n: { en: "Madar Platform — EGP receiving", ar: "حساب منصة مدار — جنيه مصري" },
      bank_name: "Commercial International Bank",
      account_holder: "Madar SaaS",
      account_number_last4: "4419",
      account_number_encrypted: "REDACTED_ENCRYPTED_PLACEHOLDER",
      iban_last4: "4419",
      currency_code: "EGP",
      country_code: "EG",
      notes_i18n: {
        en: "Reference must include tenant invoice code.",
        ar: "يجب إدراج رمز فاتورة المستأجر في التحويل.",
      },
    },
  });
  console.log(`  ✓ 1 platform bank account`);

  // ── 4. Tenant ────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "bayt-coffee" },
    update: {},
    create: {
      slug: "bayt-coffee",
      name: "Bayt Coffee Co.",
      name_i18n: { en: "Bayt Coffee Co.", ar: "بيت كوفي" },
      country_code: "EG",
      default_currency_code: "EGP",
      default_locale: "en",
      plan_id: growthPlan.id,
      status: "active",
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ── 5. Branches ──────────────────────────────────────────────────
  // find-then-create instead of upsert: the compound uniques are now PARTIAL
  // indexes (WHERE deleted_at IS NULL) which Prisma can't address as typed
  // upsert keys. Same idempotent semantics (seed never updates existing rows).
  const branches = await Promise.all(
    BRANCHES.map(
      async (b) =>
        (await prisma.branch.findFirst({
          where: { tenant_id: tenant.id, code: b.code, deleted_at: null },
        })) ??
        prisma.branch.create({
          data: {
            tenant_id: tenant.id,
            code: b.code,
            name_i18n: { en: b.name_en, ar: b.name_ar },
            currency_code: "EGP",
            opened_at: new Date(b.opened),
          },
        }),
    ),
  );
  console.log(`  ✓ ${branches.length} branches`);
  const branchByCode = new Map(branches.map((b) => [b.code, b]));
  const primaryBranch = branches[0];
  if (!primaryBranch) throw new Error("Seed expects at least one branch");

  // ── 6. Owner + cashiers ──────────────────────────────────────────
  const ownerPasswordHash = await argon2.hash("Demo123!");
  const owner =
    (await prisma.user.findFirst({
      where: { tenant_id: tenant.id, email: "owner@acme.test", deleted_at: null },
    })) ??
    (await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        email: "owner@acme.test",
        password_hash: ownerPasswordHash,
        name: "Bayt Owner",
        role: "owner",
        locale: "en",
        // Link the owner to the primary branch so the POS works out of the box.
        // Owners can change their own branch from Settings → Users.
        branch_id: primaryBranch.id,
      },
    }));

  const cashiers = await Promise.all(
    STAFF.map(async (s) => {
      const branch = branchByCode.get(s.branch_code);
      if (!branch) throw new Error(`Missing branch for cashier ${s.email}`);
      return (
        (await prisma.user.findFirst({
          where: { tenant_id: tenant.id, email: s.email, deleted_at: null },
        })) ??
        prisma.user.create({
          data: {
            tenant_id: tenant.id,
            email: s.email,
            password_hash: ownerPasswordHash,
            name: s.name,
            role: s.role,
            branch_id: branch.id,
            locale: "en",
          },
        })
      );
    }),
  );
  console.log(`  ✓ 1 owner + ${cashiers.length} cashiers`);
  const cashierByEmail = new Map(cashiers.map((c) => [c.email, c]));

  // ── 7. Categories ────────────────────────────────────────────────
  const categories = await Promise.all(
    PRODUCT_CATEGORIES.map(
      async (c) =>
        (await prisma.category.findFirst({
          where: { tenant_id: tenant.id, code: c.code, deleted_at: null },
        })) ??
        prisma.category.create({
          data: {
            tenant_id: tenant.id,
            code: c.code,
            name_i18n: { en: c.name_en, ar: c.name_ar },
            sort_order: c.sort,
          },
        }),
    ),
  );
  console.log(`  ✓ ${categories.length} categories`);
  const categoryByCode = new Map(categories.map((c) => [c.code, c]));

  // ── 8. Products ──────────────────────────────────────────────────
  const products = await Promise.all(
    PRODUCTS.map(async (p) => {
      const category = categoryByCode.get(p.cat);
      if (!category) throw new Error(`Missing category for product ${p.sku}`);
      return (
        (await prisma.product.findFirst({
          where: { tenant_id: tenant.id, sku: p.sku, deleted_at: null },
        })) ??
        prisma.product.create({
          data: {
            tenant_id: tenant.id,
            sku: p.sku,
            name_i18n: { en: p.name_en, ar: p.name_ar },
            category_id: category.id,
            price_cents: BigInt(p.price * 100),
            cost_cents: BigInt(p.cost * 100),
            currency_code: "EGP",
          },
        })
      );
    }),
  );
  console.log(`  ✓ ${products.length} products`);
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  // ── 9. Tenant bank account ───────────────────────────────────────
  await prisma.tenantBankAccount.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      tenant_id: tenant.id,
      name_i18n: { en: "Bayt Coffee — EGP main", ar: "بيت كوفي — الجنيه الرئيسي" },
      bank_name: "Banque Misr",
      account_holder: "Bayt Coffee Co.",
      account_number_last4: "8821",
      account_number_encrypted: "REDACTED_ENCRYPTED_PLACEHOLDER",
      iban_last4: "8821",
      currency_code: "EGP",
      is_default: true,
    },
  });
  console.log(`  ✓ 1 tenant bank account`);

  // ── 10. Customers ────────────────────────────────────────────────
  const customers = await Promise.all(
    CUSTOMERS.map(
      async (c) =>
        (await prisma.customer.findFirst({
          where: { tenant_id: tenant.id, phone: c.phone, deleted_at: null },
        })) ??
        prisma.customer.create({ data: { tenant_id: tenant.id, ...c } }),
    ),
  );
  console.log(`  ✓ ${customers.length} customers`);
  const customerByCode = new Map(customers.map((c) => [c.code!, c]));

  // ── 11. Branch stock + receive movements ─────────────────────────
  // Strategy: assign full stock to Maadi only, zero to others (deterministic).
  // Every branch_stock row gets a matching stock_movement (ledger consistency).
  const maadi = branchByCode.get("maadi")!;
  let stockRows = 0;
  let movementRows = 0;
  for (const product of products) {
    const seed = PRODUCTS.find((p) => p.sku === product.sku)!;
    for (const branch of branches) {
      const qty = branch.id === maadi.id ? seed.stock : 0;
      const stock = await prisma.branchStock.upsert({
        where: {
          tenant_id_branch_id_product_id: {
            tenant_id: tenant.id,
            branch_id: branch.id,
            product_id: product.id,
          },
        },
        update: {},
        create: {
          tenant_id: tenant.id,
          branch_id: branch.id,
          product_id: product.id,
          qty_on_hand: qty,
          reorder_point: seed.low,
          reorder_qty: seed.low * 2,
          last_movement_at: qty > 0 ? new Date() : null,
        },
      });
      stockRows++;
      if (qty > 0) {
        // Only emit a movement row if we actually moved stock. Idempotency:
        // check before insert (no upsert key on movement, so use a stable
        // composite via reference_table/reference_id).
        const existing = await prisma.stockMovement.findFirst({
          where: {
            tenant_id: tenant.id,
            branch_id: branch.id,
            product_id: product.id,
            reference_table: "seed",
            reference_id: stock.id,
          },
        });
        if (!existing) {
          await prisma.stockMovement.create({
            data: {
              tenant_id: tenant.id,
              branch_id: branch.id,
              product_id: product.id,
              kind: "receive",
              qty_delta: qty,
              unit_cost_cents: product.cost_cents,
              currency_code: product.currency_code,
              reference_table: "seed",
              reference_id: stock.id,
              note: "Initial seed stock",
            },
          });
          movementRows++;
        }
      }
    }
  }
  console.log(`  ✓ ${stockRows} branch_stock rows + ${movementRows} stock_movements`);

  // ── 12. Sample sale (TX-94819) + lines ───────────────────────────
  const saleBranch = branchByCode.get(SAMPLE_SALE.branch_code)!;
  const saleCashier = cashierByEmail.get(SAMPLE_SALE.cashier_email)!;
  const saleCustomer = customerByCode.get(SAMPLE_SALE.customer_code)!;

  const lineDetails = SAMPLE_SALE.lines.map((l) => {
    const product = productBySku.get(l.sku);
    if (!product) throw new Error(`Missing product ${l.sku}`);
    return {
      product,
      qty: l.qty,
      lineTotal: product.price_cents * BigInt(l.qty),
      cogs: product.cost_cents * BigInt(l.qty),
    };
  });
  const subtotal = lineDetails.reduce((s, l) => s + l.lineTotal, 0n);

  const existingSale = await prisma.sale.findUnique({
    where: { tenant_id_code: { tenant_id: tenant.id, code: SAMPLE_SALE.code } },
  });

  const sale =
    existingSale ??
    (await prisma.sale.create({
      data: {
        tenant_id: tenant.id,
        branch_id: saleBranch.id,
        code: SAMPLE_SALE.code,
        cashier_id: saleCashier.id,
        customer_id: saleCustomer.id,
        subtotal_cents: subtotal,
        total_cents: subtotal,
        currency_code: "EGP",
        payment_method: "bank_transfer",
        payment_status: "payment_pending",
        client_uuid: "11111111-1111-1111-1111-111111111119",
        client_sequence: 1,
        lines: {
          create: lineDetails.map((l) => ({
            tenant_id: tenant.id,
            product_id: l.product.id,
            qty: l.qty,
            unit_price_cents: l.product.price_cents,
            line_total_cents: l.lineTotal,
            cogs_snapshot_cents: l.cogs,
          })),
        },
      },
    }));
  console.log(`  ✓ Sample sale ${sale.code} (${sale.id})`);

  // Ledger consistency for the sample sale (non-negotiable invariant:
  // inventory commits on sale completion, and branch_stock never moves
  // without a stock_movement). The sale branch was seeded with zero stock,
  // so on first run: receive the sold quantities, then the sale consumes
  // them — two movement rows per line, net zero qty_on_hand.
  if (!existingSale) {
    for (const l of lineDetails) {
      await prisma.stockMovement.create({
        data: {
          tenant_id: tenant.id,
          branch_id: saleBranch.id,
          product_id: l.product.id,
          kind: "receive",
          qty_delta: l.qty,
          unit_cost_cents: l.product.cost_cents,
          currency_code: l.product.currency_code,
          reference_table: "seed",
          reference_id: sale.id,
          note: "Stock received ahead of sample sale",
        },
      });
      await prisma.stockMovement.create({
        data: {
          tenant_id: tenant.id,
          branch_id: saleBranch.id,
          product_id: l.product.id,
          kind: "sale",
          qty_delta: -l.qty,
          unit_cost_cents: l.product.cost_cents,
          currency_code: l.product.currency_code,
          reference_table: "sales",
          reference_id: sale.id,
        },
      });
      // +qty then -qty: cache unchanged, but stamp the movement time.
      await prisma.branchStock.updateMany({
        where: {
          tenant_id: tenant.id,
          branch_id: saleBranch.id,
          product_id: l.product.id,
        },
        data: { last_movement_at: new Date() },
      });
    }
    console.log(`  ✓ Sample sale ledger: receive + sale movements per line`);
  }

  // ── 13. Sale payment proof ───────────────────────────────────────
  const salePaymentProof = await prisma.paymentProof.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      tenant_id: tenant.id,
      context: "sale",
      reference_id: sale.id,
      amount_cents: sale.total_cents,
      currency_code: "EGP",
      bank_account_kind: "tenant",
      bank_account_id: "00000000-0000-0000-0000-000000000002",
      payer_name: "Nadia Hosny",
      payer_bank: "NBE",
      transfer_date: new Date(),
      transfer_reference: "TR-9182374",
      receipt_image_url: `tenants/${tenant.id}/payment-proofs/seed-sale.jpg`,
      status: "pending",
    },
  });
  console.log(`  ✓ Sale payment proof (${salePaymentProof.id}, pending)`);

  // ── 14. Subscription invoice + its payment proof ─────────────────
  const invoice = await prisma.subscriptionInvoice.upsert({
    where: { tenant_id_reference_code: { tenant_id: tenant.id, reference_code: "INV-2026-05-001" } },
    update: {},
    create: {
      tenant_id: tenant.id,
      plan_id: growthPlan.id,
      period_start: new Date("2026-05-01"),
      period_end: new Date("2026-05-31"),
      due_date: new Date("2026-05-31"),
      amount_cents: growthPlan.monthly_price_cents,
      currency_code: "USD",
      status: "in_review",
      reference_code: "INV-2026-05-001",
    },
  });

  const subPaymentProof = await prisma.paymentProof.upsert({
    where: { id: "00000000-0000-0000-0000-000000000011" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      tenant_id: tenant.id,
      context: "subscription",
      reference_id: invoice.id,
      amount_cents: invoice.amount_cents,
      currency_code: "USD",
      bank_account_kind: "platform",
      bank_account_id: platformBank.id,
      payer_name: "Bayt Coffee Co.",
      payer_bank: "Banque Misr",
      transfer_date: new Date(),
      transfer_reference: "WIRE-58832",
      receipt_image_url: `tenants/${tenant.id}/payment-proofs/seed-sub.jpg`,
      status: "pending",
    },
  });
  console.log(`  ✓ Subscription invoice ${invoice.reference_code} + payment proof (${subPaymentProof.id}, pending)`);

  // ── 15. Awaiting-payment invoice (drives the tenant pay-invoice demo) ──
  const nextPeriodStart = new Date("2026-06-01");
  const nextPeriodEnd = new Date("2026-06-30");
  const nextDue = new Date("2026-06-30");
  const awaitingInvoice = await prisma.subscriptionInvoice.upsert({
    where: { tenant_id_reference_code: { tenant_id: tenant.id, reference_code: "INV-2026-06-001" } },
    update: {},
    create: {
      tenant_id: tenant.id,
      plan_id: growthPlan.id,
      period_start: nextPeriodStart,
      period_end: nextPeriodEnd,
      due_date: nextDue,
      amount_cents: growthPlan.monthly_price_cents,
      currency_code: "USD",
      status: "awaiting_payment",
      reference_code: "INV-2026-06-001",
    },
  });
  console.log(`  ✓ Awaiting invoice ${awaitingInvoice.reference_code} (drives /billing pay flow)`);

  console.log("");
  console.log("✅ Seed complete.");
  console.log("");
  console.log("  Demo tenant id:        " + tenant.id);
  console.log("  Tenant owner login:    owner@acme.test / Demo123!");
  console.log("  Super-admin login:     admin@platform.test / Admin123!");
  console.log("  Super-admin TOTP URL:  " + otpauthUrl);
  console.log("");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
