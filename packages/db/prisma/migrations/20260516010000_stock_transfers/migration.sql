-- Phase 2.2 — stock transfers (in-transit state machine).
--
-- Table A: `stock_transfers` is the header. State machine:
--   draft → in_transit (sender confirms dispatch; sender stock leaves the
--           branch via a transfer_out stock_movement) → received (receiver
--           confirms arrival; receiver stock arrives via transfer_in).
--   draft → cancelled (only from draft — once goods are in transit the
--           ledger must be unwound by an explicit adjustment, not a cancel).
--
-- Table B: `stock_transfer_lines` is one row per product + sent qty.
-- `qty_received` is NULL until the receive step; when it differs from
-- `qty_sent` the line is marked discrepant and the receiver records the
-- delta as a manual adjustment afterward (not auto-magically).

-- ── enum ────────────────────────────────────────────────────────────
CREATE TYPE "StockTransferStatus" AS ENUM ('draft', 'in_transit', 'received', 'cancelled');

-- ── stock_transfers ────────────────────────────────────────────────
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "from_branch_id" UUID NOT NULL,
    "to_branch_id" UUID NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "sent_at" TIMESTAMPTZ,
    "sent_by" UUID,
    "received_at" TIMESTAMPTZ,
    "received_by" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_transfers_distinct_branches"
      CHECK ("from_branch_id" <> "to_branch_id")
);

CREATE UNIQUE INDEX "stock_transfers_tenant_code_unique"
  ON "stock_transfers" ("tenant_id", "code");

CREATE INDEX "stock_transfers_tenant_status_created_idx"
  ON "stock_transfers" ("tenant_id", "status", "created_at" DESC);

CREATE INDEX "stock_transfers_tenant_from_branch_idx"
  ON "stock_transfers" ("tenant_id", "from_branch_id");

CREATE INDEX "stock_transfers_tenant_to_branch_idx"
  ON "stock_transfers" ("tenant_id", "to_branch_id");

CREATE INDEX "stock_transfers_tenant_deleted_idx"
  ON "stock_transfers" ("tenant_id", "deleted_at");

-- ── stock_transfer_lines ───────────────────────────────────────────
CREATE TABLE "stock_transfer_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty_sent" INT NOT NULL,
    "qty_received" INT,
    "discrepancy_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_transfer_lines_qty_sent_positive" CHECK ("qty_sent" > 0),
    CONSTRAINT "stock_transfer_lines_qty_received_nonneg" CHECK ("qty_received" IS NULL OR "qty_received" >= 0),
    CONSTRAINT "stock_transfer_lines_transfer_fk"
      FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "stock_transfer_lines_transfer_product_unique"
  ON "stock_transfer_lines" ("transfer_id", "product_id");

CREATE INDEX "stock_transfer_lines_tenant_transfer_idx"
  ON "stock_transfer_lines" ("tenant_id", "transfer_id");

CREATE INDEX "stock_transfer_lines_tenant_product_idx"
  ON "stock_transfer_lines" ("tenant_id", "product_id");

-- ── updated_at triggers (mirror init migration pattern) ────────────
CREATE TRIGGER stock_transfers_set_updated_at BEFORE UPDATE ON "stock_transfers"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER stock_transfer_lines_set_updated_at BEFORE UPDATE ON "stock_transfer_lines"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS (mirror init migration pattern) ────────────────────────────
ALTER TABLE "stock_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_transfers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_transfers"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "stock_transfer_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_transfer_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_transfer_lines"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );
