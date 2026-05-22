-- ═══════════════════════════════════════════════════════════════════
-- Madar — initial schema with row-level security
-- ═══════════════════════════════════════════════════════════════════
-- IMMUTABLE: once this migration lands on main, never edit. Fix in 002+.

-- ──────────────────────────────────────────────────────────────────
-- CreateEnum
-- ──────────────────────────────────────────────────────────────────

CREATE TYPE "TenantStatus" AS ENUM ('trialing', 'active', 'grace_period', 'suspended', 'cancelled');
CREATE TYPE "TenantUserRole" AS ENUM ('owner', 'manager', 'cashier', 'accountant', 'auditor');
CREATE TYPE "PlatformUserRole" AS ENUM ('owner', 'finance', 'support', 'developer', 'readonly');
CREATE TYPE "StockMovementKind" AS ENUM ('sale', 'return_in', 'transfer_in', 'transfer_out', 'adjustment', 'receive', 'waste');
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'bank_transfer', 'store_credit', 'split');
CREATE TYPE "SalePaymentStatus" AS ENUM ('paid', 'payment_pending', 'disputed', 'refunded');
CREATE TYPE "PaymentProofContext" AS ENUM ('subscription', 'sale');
CREATE TYPE "PaymentProofBankKind" AS ENUM ('platform', 'tenant');
CREATE TYPE "PaymentProofStatus" AS ENUM ('pending', 'verified', 'rejected', 'cancelled');
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('draft', 'awaiting_payment', 'in_review', 'paid', 'overdue', 'cancelled');

-- ──────────────────────────────────────────────────────────────────
-- CreateTable: Platform tables (no tenant_id, no RLS)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "monthly_price_cents" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "limits" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "default_currency_code" CHAR(3) NOT NULL,
    "default_locale" VARCHAR(8) NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'trialing',
    "trial_ends_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "PlatformUserRole" NOT NULL DEFAULT 'readonly',
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

CREATE TABLE "platform_audit_log" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_tenant_id" UUID,
    "target_entity" TEXT,
    "target_id" UUID,
    "reason" TEXT,
    "ip" INET,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_audit_log_platform_user_id_created_at_idx" ON "platform_audit_log"("platform_user_id", "created_at" DESC);
CREATE INDEX "platform_audit_log_target_tenant_id_created_at_idx" ON "platform_audit_log"("target_tenant_id", "created_at" DESC);

CREATE TABLE "platform_bank_accounts" (
    "id" UUID NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_holder" TEXT NOT NULL,
    "account_number_last4" VARCHAR(4) NOT NULL,
    "account_number_encrypted" TEXT NOT NULL,
    "iban_last4" VARCHAR(4),
    "swift" TEXT,
    "currency_code" CHAR(3) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes_i18n" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_bank_accounts_currency_code_country_code_is_active_idx" ON "platform_bank_accounts"("currency_code", "country_code", "is_active");

-- ──────────────────────────────────────────────────────────────────
-- CreateTable: Tenant-scoped tables (RLS added below)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "TenantUserRole" NOT NULL DEFAULT 'cashier',
    "branch_id" UUID,
    "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "mfa_secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");
CREATE INDEX "users_tenant_id_deleted_at_idx" ON "users"("tenant_id", "deleted_at");

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "address_i18n" JSONB,
    "currency_code" CHAR(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "opened_at" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");
CREATE INDEX "branches_tenant_id_deleted_at_idx" ON "branches"("tenant_id", "deleted_at");

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_tenant_id_code_key" ON "categories"("tenant_id", "code");
CREATE INDEX "categories_tenant_id_deleted_at_idx" ON "categories"("tenant_id", "deleted_at");

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "description_i18n" JSONB,
    "category_id" UUID,
    "price_cents" BIGINT NOT NULL,
    "cost_cents" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "barcode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");
CREATE INDEX "products_tenant_id_deleted_at_idx" ON "products"("tenant_id", "deleted_at");
CREATE INDEX "products_tenant_id_category_id_idx" ON "products"("tenant_id", "category_id");

CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customers_tenant_id_phone_key" ON "customers"("tenant_id", "phone");
CREATE UNIQUE INDEX "customers_tenant_id_email_key" ON "customers"("tenant_id", "email");
CREATE INDEX "customers_tenant_id_deleted_at_idx" ON "customers"("tenant_id", "deleted_at");

CREATE TABLE "tenant_bank_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_holder" TEXT NOT NULL,
    "account_number_last4" VARCHAR(4) NOT NULL,
    "account_number_encrypted" TEXT NOT NULL,
    "iban_last4" VARCHAR(4),
    "swift" TEXT,
    "currency_code" CHAR(3) NOT NULL,
    "branch_id" UUID,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "tenant_bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tenant_bank_accounts_tenant_id_deleted_at_idx" ON "tenant_bank_accounts"("tenant_id", "deleted_at");
CREATE INDEX "tenant_bank_accounts_tenant_id_currency_code_idx" ON "tenant_bank_accounts"("tenant_id", "currency_code");

CREATE TABLE "branch_stock" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty_on_hand" INTEGER NOT NULL DEFAULT 0,
    "reorder_point" INTEGER,
    "reorder_qty" INTEGER,
    "last_movement_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "branch_stock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branch_stock_tenant_id_branch_id_product_id_key" ON "branch_stock"("tenant_id", "branch_id", "product_id");
CREATE INDEX "branch_stock_tenant_id_deleted_at_idx" ON "branch_stock"("tenant_id", "deleted_at");

CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "qty_delta" INTEGER NOT NULL,
    "unit_cost_cents" BIGINT,
    "reference_table" TEXT,
    "reference_id" UUID,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_movements_tenant_id_occurred_at_idx" ON "stock_movements"("tenant_id", "occurred_at" DESC);
CREATE INDEX "stock_movements_tenant_id_branch_id_product_id_occurred_at_idx" ON "stock_movements"("tenant_id", "branch_id", "product_id", "occurred_at" DESC);

CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "cashier_id" UUID NOT NULL,
    "customer_id" UUID,
    "subtotal_cents" BIGINT NOT NULL,
    "discount_cents" BIGINT NOT NULL DEFAULT 0,
    "tax_cents" BIGINT NOT NULL DEFAULT 0,
    "total_cents" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" "SalePaymentStatus" NOT NULL DEFAULT 'paid',
    "client_uuid" UUID NOT NULL,
    "client_sequence" INTEGER,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_tenant_id_client_uuid_key" ON "sales"("tenant_id", "client_uuid");
CREATE UNIQUE INDEX "sales_tenant_id_code_key" ON "sales"("tenant_id", "code");
CREATE INDEX "sales_tenant_id_occurred_at_idx" ON "sales"("tenant_id", "occurred_at" DESC);
CREATE INDEX "sales_tenant_id_branch_id_occurred_at_idx" ON "sales"("tenant_id", "branch_id", "occurred_at" DESC);
CREATE INDEX "sales_tenant_id_payment_status_idx" ON "sales"("tenant_id", "payment_status");

CREATE TABLE "sale_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_cents" BIGINT NOT NULL,
    "discount_cents" BIGINT NOT NULL DEFAULT 0,
    "tax_cents" BIGINT NOT NULL DEFAULT 0,
    "line_total_cents" BIGINT NOT NULL,
    "cogs_snapshot_cents" BIGINT NOT NULL,
    "note_i18n" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sale_lines_tenant_id_sale_id_idx" ON "sale_lines"("tenant_id", "sale_id");
CREATE INDEX "sale_lines_tenant_id_product_id_idx" ON "sale_lines"("tenant_id", "product_id");

CREATE TABLE "payment_proofs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "context" "PaymentProofContext" NOT NULL,
    "reference_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "bank_account_kind" "PaymentProofBankKind" NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "payer_name" TEXT NOT NULL,
    "payer_bank" TEXT,
    "transfer_date" DATE NOT NULL,
    "transfer_reference" TEXT,
    "receipt_image_url" TEXT NOT NULL,
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'pending',
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_proofs_tenant_id_status_created_at_idx" ON "payment_proofs"("tenant_id", "status", "created_at" DESC);
CREATE INDEX "payment_proofs_tenant_id_context_reference_id_idx" ON "payment_proofs"("tenant_id", "context", "reference_id");

CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'draft',
    "reference_code" TEXT NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_invoices_tenant_id_reference_code_key" ON "subscription_invoices"("tenant_id", "reference_code");
CREATE INDEX "subscription_invoices_tenant_id_status_due_date_idx" ON "subscription_invoices"("tenant_id", "status", "due_date");

CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "impersonator_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at" DESC);
CREATE INDEX "audit_log_tenant_id_entity_entity_id_idx" ON "audit_log"("tenant_id", "entity", "entity_id");

-- ──────────────────────────────────────────────────────────────────
-- AddForeignKey
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════
-- HAND-APPENDED BELOW: triggers + RLS policies
-- (Prisma does not generate these.)
-- ══════════════════════════════════════════════════════════════════

-- ── 1. updated_at auto-update trigger ──────────────────────────────

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table that has updated_at
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'plans', 'tenants', 'platform_users', 'platform_bank_accounts',
    'users', 'branches', 'categories', 'products', 'customers',
    'tenant_bank_accounts', 'branch_stock', 'sales', 'sale_lines',
    'payment_proofs', 'subscription_invoices'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ── 2. Append-only triggers on audit logs ──────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_log_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit log tables are append-only (operation: %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_block_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_append_only();
CREATE TRIGGER audit_log_block_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_append_only();

CREATE TRIGGER platform_audit_log_block_update BEFORE UPDATE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_append_only();
CREATE TRIGGER platform_audit_log_block_delete BEFORE DELETE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_append_only();

-- ── 3. Row-level security on every tenant-scoped table ─────────────
-- USING + WITH CHECK both reference the same condition:
--   * super-admin flag bypasses (admin app)
--   * otherwise tenant_id must match session var
-- current_setting(name, true) returns NULL on missing → policy false → 0 rows visible.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users', 'branches', 'categories', 'products', 'customers',
    'tenant_bank_accounts', 'branch_stock', 'stock_movements',
    'sales', 'sale_lines', 'payment_proofs', 'subscription_invoices',
    'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    -- FORCE makes the table owner obey RLS too (Prisma role is non-superuser
    -- by default, but FORCE is required to keep the canary test honest).
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON %I
        USING (
          current_setting('app.is_super_admin', true) = 'true'
          OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
        WITH CHECK (
          current_setting('app.is_super_admin', true) = 'true'
          OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
        );
    $pol$, t);
  END LOOP;
END $$;
