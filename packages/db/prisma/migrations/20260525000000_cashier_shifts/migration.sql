-- B1 — Cashier shifts + cash-drawer reconciliation.
--
-- Per-cashier shift sessions: opening float → sales / refunds attach to the
-- shift → end-of-shift declared cash count is reconciled against expected
-- (opening + cash sales - cash refunds). Z-report is computed on demand from
-- the shift's joined sales + sale_payments.
--
-- Constraint: at most one OPEN shift per cashier per tenant (enforced by a
-- partial unique index). Sales gain a nullable `shift_id` so completeSale
-- can attach the current cashier's open shift when one exists; the FK is
-- ON DELETE SET NULL so a soft-deleted shift doesn't cascade-delete sales.

-- ── enum ───────────────────────────────────────────────────────────
CREATE TYPE "CashierShiftStatus" AS ENUM (
  'open',
  'closed'
);

-- ── cashier_shifts ─────────────────────────────────────────────────
CREATE TABLE "cashier_shifts" (
    "id"                          UUID                  NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                   UUID                  NOT NULL,
    "branch_id"                   UUID                  NOT NULL,
    "cashier_id"                  UUID                  NOT NULL,
    "opened_at"                   TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by"                   UUID                  NOT NULL,
    "closed_at"                   TIMESTAMPTZ,
    "closed_by"                   UUID,
    "opening_float_cents"         BIGINT                NOT NULL,
    "declared_closing_cash_cents" BIGINT,
    "expected_closing_cash_cents" BIGINT,
    "variance_cents"              BIGINT,
    "currency_code"               CHAR(3)               NOT NULL,
    "notes"                       TEXT,
    "status"                      "CashierShiftStatus"  NOT NULL DEFAULT 'open',
    "created_at"                  TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                  TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"                  TIMESTAMPTZ,
    CONSTRAINT "cashier_shifts_pkey" PRIMARY KEY ("id")
);

-- One OPEN shift per (tenant, cashier) at any time. Soft-deleted shifts
-- are excluded so re-opening after a delete works cleanly.
CREATE UNIQUE INDEX "cashier_shifts_one_open_per_cashier"
  ON "cashier_shifts" ("tenant_id", "cashier_id")
  WHERE "status" = 'open' AND "deleted_at" IS NULL;

CREATE INDEX "cashier_shifts_tenant_branch_status_opened_idx"
  ON "cashier_shifts" ("tenant_id", "branch_id", "status", "opened_at" DESC);
CREATE INDEX "cashier_shifts_tenant_deleted_idx"
  ON "cashier_shifts" ("tenant_id", "deleted_at");

-- updated_at trigger reuses the existing function from the init migration.
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "cashier_shifts"
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE "cashier_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cashier_shifts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cashier_shifts"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

-- ── sales.shift_id ─────────────────────────────────────────────────
ALTER TABLE "sales"
  ADD COLUMN "shift_id" UUID;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "cashier_shifts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sales_tenant_shift_idx"
  ON "sales" ("tenant_id", "shift_id")
  WHERE "shift_id" IS NOT NULL;
