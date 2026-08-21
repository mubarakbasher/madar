-- Quotations — saved, numbered price quotes (عرض سعر) with a validity
-- window, convertible to a real sale in one tap. Separate lifecycle from
-- held sales (numbered, long-lived, customer-facing) so a fresh pair of
-- tables. Lines snapshot name_i18n/sku so a quote still renders after the
-- source product is renamed or deleted. Standard mutable tenant table
-- (quotations): audit + soft-delete cols, updated_at trigger, RLS.
-- quotation_lines is an immutable snapshot child (like held_sale_lines /
-- sale_lines): no updated_at, no trigger, no append-only guard requested
-- for either table per the quotations plan (quotes mutate via cancel/convert).
--
-- Hand-written (not `prisma migrate dev`) because this dev database carries
-- pre-existing, unrelated index-naming drift against a dozen other tables
-- (see 20260820230305_customer_receivables/migration.sql and its task
-- report) that a fresh `migrate dev` diff would otherwise re-surface. This
-- file contains only the statements for the Quotation/QuotationLine models,
-- filtered byte-for-byte from `prisma migrate diff --from-url ... --script`.

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('open', 'converted', 'cancelled');

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "customer_id" UUID,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'open',
    "subtotal_cents" BIGINT NOT NULL DEFAULT 0,
    "discount_cents" BIGINT NOT NULL DEFAULT 0,
    "tax_cents" BIGINT NOT NULL DEFAULT 0,
    "total_cents" BIGINT NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL,
    "valid_until" TIMESTAMPTZ NOT NULL,
    "converted_sale_id" UUID,
    "converted_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "sku" TEXT,
    "qty" INTEGER NOT NULL,
    "unit_price_cents" BIGINT NOT NULL,
    "discount_cents" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotations_tenant_id_branch_id_status_created_at_idx" ON "quotations"("tenant_id", "branch_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quotations_tenant_id_customer_id_idx" ON "quotations"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_deleted_at_idx" ON "quotations"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenant_id_code_key" ON "quotations"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "quotation_lines_tenant_id_quotation_id_idx" ON "quotation_lines"("tenant_id", "quotation_id");

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- updated_at trigger (shared fn defined in 20260514000000_init). quotations
-- is the mutable parent (cancel/convert update it); quotation_lines is an
-- immutable snapshot child and gets no trigger, per convention.
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "quotations"
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- RLS — role-scoped (ADR 0004). madar_app sees only its own tenant; madar_admin
-- (adminPrisma) sees everything. No super-admin GUC branch, no append-only guard.
ALTER TABLE "quotations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quotations" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "quotations"
  FOR ALL TO madar_app
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE POLICY admin_full_access ON "quotations"
  FOR ALL TO madar_admin
  USING (true)
  WITH CHECK (true);

ALTER TABLE "quotation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quotation_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "quotation_lines"
  FOR ALL TO madar_app
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE POLICY admin_full_access ON "quotation_lines"
  FOR ALL TO madar_admin
  USING (true)
  WITH CHECK (true);
