-- Phase 1.10 — POS completeness.
--
-- Five tenant-scoped tables that close out Phase 1.10c/d/e:
--   * tax_classes               — per-tenant tax rate buckets (slice 1)
--   * held_sales + held_sale_lines — server-side held carts (slice 2)
--   * store_credit_ledger       — append-only customer balance ledger (slice 4)
--   * sale_payments             — multi-payment-method support, enables split (slice 5)
--
-- Plus four existing-table extensions:
--   * tenants.default_tax_class_id / tax_inclusive_default / tax_registration_number  (slice 1)
--   * products.tax_class_id     (slice 1)
--   * sales.approval_code       (slice 3 — card payment)
--   * customers.store_credit_balance_minor / store_credit_currency_code  (slice 4)
--
-- RLS: every new tenant-scoped table uses the canonical NULLIF tenant_isolation
-- policy (see 20260514020000_rls_policy_nullif/migration.sql for the why).
-- store_credit_ledger has no updated_at (append-only ledger, never mutated).
-- sale_payments also has no updated_at (append-only history).

-- ── enums ───────────────────────────────────────────────────────────
CREATE TYPE "StoreCreditReference" AS ENUM (
  'sale',
  'refund',
  'manual_adjust',
  'expiration',
  'cancel'
);

-- ── slice 1: tax_classes table ─────────────────────────────────────
CREATE TABLE "tax_classes" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID         NOT NULL,
    "code"       TEXT         NOT NULL,
    "name_i18n"  JSONB        NOT NULL,
    "rate_bps"   INT          NOT NULL,
    "is_active"  BOOLEAN      NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "tax_classes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_classes_rate_bps_nonneg" CHECK ("rate_bps" >= 0)
);

CREATE UNIQUE INDEX "tax_classes_tenant_code_unique"
  ON "tax_classes" ("tenant_id", "code");
CREATE INDEX "tax_classes_tenant_deleted_idx"
  ON "tax_classes" ("tenant_id", "deleted_at");
CREATE INDEX "tax_classes_tenant_active_idx"
  ON "tax_classes" ("tenant_id", "is_active");

-- ── slice 1: tenants extensions ────────────────────────────────────
ALTER TABLE "tenants"
  ADD COLUMN "default_tax_class_id"    UUID,
  ADD COLUMN "tax_inclusive_default"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tax_registration_number" TEXT;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_default_tax_class_fk"
    FOREIGN KEY ("default_tax_class_id")
    REFERENCES "tax_classes"("id")
    ON DELETE SET NULL;

CREATE INDEX "tenants_default_tax_class_idx"
  ON "tenants" ("default_tax_class_id");

-- ── slice 1: products.tax_class_id ─────────────────────────────────
ALTER TABLE "products"
  ADD COLUMN "tax_class_id" UUID;

ALTER TABLE "products"
  ADD CONSTRAINT "products_tax_class_fk"
    FOREIGN KEY ("tax_class_id")
    REFERENCES "tax_classes"("id")
    ON DELETE SET NULL;

CREATE INDEX "products_tenant_tax_class_idx"
  ON "products" ("tenant_id", "tax_class_id");

-- ── slice 2: held_sales ────────────────────────────────────────────
CREATE TABLE "held_sales" (
    "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"            UUID         NOT NULL,
    "branch_id"            UUID         NOT NULL,
    "cashier_id"           UUID         NOT NULL,
    "customer_id"          UUID,
    "name"                 TEXT         NOT NULL,
    "note"                 TEXT,
    "subtotal_cents"       BIGINT       NOT NULL DEFAULT 0,
    "discount_cents"       BIGINT       NOT NULL DEFAULT 0,
    "tax_cents"            BIGINT       NOT NULL DEFAULT 0,
    "total_cents"          BIGINT       NOT NULL DEFAULT 0,
    "currency_code"        CHAR(3)      NOT NULL,
    "held_at"              TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumed_at"           TIMESTAMPTZ,
    "resumed_into_sale_id" UUID,
    "discarded_at"         TIMESTAMPTZ,
    "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"           UUID,
    "deleted_at"           TIMESTAMPTZ,
    CONSTRAINT "held_sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "held_sales_branch_fk"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE NO ACTION,
    CONSTRAINT "held_sales_cashier_fk"
      FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE NO ACTION,
    CONSTRAINT "held_sales_customer_fk"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL,
    CONSTRAINT "held_sales_resumed_sale_fk"
      FOREIGN KEY ("resumed_into_sale_id") REFERENCES "sales"("id") ON DELETE SET NULL
);

CREATE INDEX "held_sales_tenant_branch_cashier_held_idx"
  ON "held_sales" ("tenant_id", "branch_id", "cashier_id", "held_at" DESC);
CREATE INDEX "held_sales_tenant_branch_held_idx"
  ON "held_sales" ("tenant_id", "branch_id", "held_at" DESC);
CREATE INDEX "held_sales_tenant_deleted_idx"
  ON "held_sales" ("tenant_id", "deleted_at");

-- ── slice 2: held_sale_lines ───────────────────────────────────────
CREATE TABLE "held_sale_lines" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID         NOT NULL,
    "held_sale_id"     UUID         NOT NULL,
    "product_id"       UUID         NOT NULL,
    "qty"              INT          NOT NULL,
    "unit_price_cents" BIGINT       NOT NULL,
    "discount_cents"   BIGINT       NOT NULL DEFAULT 0,
    "note"             TEXT,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "held_sale_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "held_sale_lines_qty_positive" CHECK ("qty" > 0),
    CONSTRAINT "held_sale_lines_held_sale_fk"
      FOREIGN KEY ("held_sale_id") REFERENCES "held_sales"("id") ON DELETE CASCADE,
    CONSTRAINT "held_sale_lines_product_fk"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION
);

CREATE INDEX "held_sale_lines_tenant_held_sale_idx"
  ON "held_sale_lines" ("tenant_id", "held_sale_id");

-- ── slice 3: sales.approval_code ───────────────────────────────────
ALTER TABLE "sales"
  ADD COLUMN "approval_code" TEXT;

-- ── slice 4: customers.store_credit columns ────────────────────────
ALTER TABLE "customers"
  ADD COLUMN "store_credit_balance_minor" BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN "store_credit_currency_code" CHAR(3);

-- ── slice 4: store_credit_ledger ───────────────────────────────────
CREATE TABLE "store_credit_ledger" (
    "id"                  UUID                   NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"           UUID                   NOT NULL,
    "customer_id"         UUID                   NOT NULL,
    "amount_minor"        BIGINT                 NOT NULL,
    "balance_after_minor" BIGINT                 NOT NULL,
    "currency_code"       CHAR(3)                NOT NULL,
    "reference_table"     "StoreCreditReference" NOT NULL,
    "reference_id"        UUID,
    "note_i18n"           JSONB,
    "created_by"          UUID,
    "created_at"          TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "store_credit_ledger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_credit_ledger_customer_fk"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
);

CREATE INDEX "store_credit_ledger_tenant_customer_created_idx"
  ON "store_credit_ledger" ("tenant_id", "customer_id", "created_at" DESC);
CREATE INDEX "store_credit_ledger_tenant_reference_idx"
  ON "store_credit_ledger" ("tenant_id", "reference_table", "reference_id");

-- ── slice 5: sale_payments ─────────────────────────────────────────
CREATE TABLE "sale_payments" (
    "id"                     UUID            NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"              UUID            NOT NULL,
    "sale_id"                UUID            NOT NULL,
    "method"                 "PaymentMethod" NOT NULL,
    "amount_cents"           BIGINT          NOT NULL,
    "approval_code"          TEXT,
    "cash_tendered_cents"    BIGINT,
    "change_due_cents"       BIGINT,
    "payment_proof_id"       UUID,
    "store_credit_ledger_id" UUID,
    "created_at"             TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_payments_amount_positive" CHECK ("amount_cents" > 0),
    CONSTRAINT "sale_payments_sale_fk"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
    CONSTRAINT "sale_payments_proof_fk"
      FOREIGN KEY ("payment_proof_id") REFERENCES "payment_proofs"("id") ON DELETE SET NULL,
    CONSTRAINT "sale_payments_ledger_fk"
      FOREIGN KEY ("store_credit_ledger_id") REFERENCES "store_credit_ledger"("id") ON DELETE SET NULL
);

CREATE INDEX "sale_payments_tenant_sale_created_idx"
  ON "sale_payments" ("tenant_id", "sale_id", "created_at");
CREATE INDEX "sale_payments_tenant_method_idx"
  ON "sale_payments" ("tenant_id", "method");

-- ── updated_at triggers (mirror init migration pattern) ────────────
-- store_credit_ledger and held_sale_lines have no updated_at column.
-- sale_payments is append-only, no updated_at.
CREATE TRIGGER tax_classes_set_updated_at BEFORE UPDATE ON "tax_classes"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER held_sales_set_updated_at BEFORE UPDATE ON "held_sales"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS (NULLIF cast per 20260514020000) ───────────────────────────
ALTER TABLE "tax_classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_classes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_classes"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "held_sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "held_sales" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "held_sales"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "held_sale_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "held_sale_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "held_sale_lines"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "store_credit_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_credit_ledger" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "store_credit_ledger"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "sale_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_payments"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );
