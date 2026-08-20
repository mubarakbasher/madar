-- Customer receivables (credit sales) — Task 1 of the receivables feature.
-- Adds:
--   * enum ReceivableReference
--   * PaymentMethod.on_account — derived payment method for a full-credit
--     sale with no tender slices (Task 2 relies on this)
--   * SalePaymentStatus.partially_paid / unpaid
--   * customers.receivable_balance_minor / receivable_currency_code
--   * sales.balance_due_cents + (tenant_id, customer_id, payment_status) index
--   * customer_receivable_ledger — append-only per-customer ledger, same
--     shape/conventions as store_credit_ledger (20260521000000_pos_completeness)
--
-- Hand-written (not machine-diffed): this dev database has pre-existing,
-- unrelated index-naming drift against schema.prisma (hand-authored index
-- names from earlier migrations vs Prisma's default naming convention) that
-- `prisma migrate dev`'s diff engine picks up as spurious DROP/RENAME/ADD
-- noise across many unrelated tables. That drift predates this task and is
-- out of scope here, so this file contains only the statements for the
-- schema.prisma edits above (verified against `prisma migrate diff` output
-- filtered to just these symbols).

-- ── enums ────────────────────────────────────────────────────────────
CREATE TYPE "ReceivableReference" AS ENUM ('sale', 'sale_payment', 'manual_adjust');

ALTER TYPE "PaymentMethod" ADD VALUE 'on_account';

-- AlterEnum: PostgreSQL 11 and earlier cannot add multiple values to an enum
-- in a single migration; both must be added and this migration must be the
-- only one touching SalePaymentStatus in this transaction.
ALTER TYPE "SalePaymentStatus" ADD VALUE 'partially_paid';
ALTER TYPE "SalePaymentStatus" ADD VALUE 'unpaid';

-- ── customers: receivable balance ──────────────────────────────────────
ALTER TABLE "customers"
  ADD COLUMN "receivable_balance_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "receivable_currency_code" CHAR(3);

-- ── sales: balance_due_cents ────────────────────────────────────────────
ALTER TABLE "sales"
  ADD COLUMN "balance_due_cents" BIGINT NOT NULL DEFAULT 0;

CREATE INDEX "sales_tenant_id_customer_id_payment_status_idx"
  ON "sales" ("tenant_id", "customer_id", "payment_status");

-- ── customer_receivable_ledger ──────────────────────────────────────────
CREATE TABLE "customer_receivable_ledger" (
    "id"                  UUID                   NOT NULL,
    "tenant_id"           UUID                   NOT NULL,
    "customer_id"         UUID                   NOT NULL,
    "amount_minor"        BIGINT                 NOT NULL,
    "balance_after_minor" BIGINT                 NOT NULL,
    "currency_code"       CHAR(3)                NOT NULL,
    "reference_table"     "ReceivableReference"  NOT NULL,
    "reference_id"        UUID,
    "note_i18n"           JSONB,
    "created_by"          UUID,
    "created_at"          TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_receivable_ledger_pkey" PRIMARY KEY ("id"),
    -- Restrict: a hard customer delete must never erase financial history,
    -- matching store_credit_ledger_customer_fk (20260611130000_audit_remediation_schema).
    CONSTRAINT "customer_receivable_ledger_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "customer_receivable_ledger_tenant_id_customer_id_created_at_idx"
  ON "customer_receivable_ledger" ("tenant_id", "customer_id", "created_at" DESC);
CREATE INDEX "customer_receivable_ledger_tenant_id_reference_table_refere_idx"
  ON "customer_receivable_ledger" ("tenant_id", "reference_table", "reference_id");

-- ── RLS — role-scoped (ADR 0004) ────────────────────────────────────────
-- store_credit_ledger (the closest analog — same shape, also append-only by
-- convention) has no DB-level UPDATE/DELETE-blocking policy anywhere in this
-- codebase (checked: no `AS RESTRICTIVE` policy exists in any migration, and
-- store_credit_ledger's own RLS is exactly tenant_isolation + admin_full_access,
-- see 20260521000000_pos_completeness and 20260612000000_admin_role_split).
-- Its append-only guarantee is enforced by application convention only (no
-- service ever issues UPDATE/DELETE against it). For consistency with that
-- existing mechanism, this table gets the same two policies and no
-- additional RESTRICTIVE no_update/no_delete policies.
ALTER TABLE "customer_receivable_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_receivable_ledger" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "customer_receivable_ledger"
  FOR ALL TO madar_app
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE POLICY admin_full_access ON "customer_receivable_ledger"
  FOR ALL TO madar_admin
  USING (true)
  WITH CHECK (true);
