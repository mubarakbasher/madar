-- B2 — Customer refunds / sale returns.
--
-- New tenant-scoped tables: sale_refunds (header), sale_refund_lines (which
-- lines of the original sale were refunded), sale_refund_payments (how the
-- money went back — cash / bank_transfer / store_credit / split). Plus a
-- denormalized counter on `sales` for fast "is fully refunded" lookups.
--
-- Lifecycle: a refund is created in `completed` status in one transaction.
-- `voided` is reserved for a future flow (reverse a refund) — the enum is
-- extensible but the v1 service only writes `completed`.

CREATE TYPE "SaleRefundStatus" AS ENUM (
  'completed',
  'voided'
);

-- ── sale_refunds ───────────────────────────────────────────────────
CREATE TABLE "sale_refunds" (
    "id"                     UUID                NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"              UUID                NOT NULL,
    "sale_id"                UUID                NOT NULL,
    "branch_id"              UUID                NOT NULL,
    "cashier_id"             UUID                NOT NULL,
    "shift_id"               UUID,
    "customer_id"            UUID,
    "code"                   TEXT                NOT NULL,
    "currency_code"          CHAR(3)             NOT NULL,
    "subtotal_cents"         BIGINT              NOT NULL,
    "tax_cents"              BIGINT              NOT NULL DEFAULT 0,
    "total_cents"            BIGINT              NOT NULL,
    "notes"                  TEXT,
    "requires_manager"       BOOLEAN             NOT NULL DEFAULT false,
    "approved_by_user_id"    UUID,
    "status"                 "SaleRefundStatus"  NOT NULL DEFAULT 'completed',
    "occurred_at"            TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"             TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"             UUID,
    "deleted_at"             TIMESTAMPTZ,
    CONSTRAINT "sale_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_refunds_tenant_code_unique"
  ON "sale_refunds" ("tenant_id", "code")
  WHERE "deleted_at" IS NULL;

CREATE INDEX "sale_refunds_tenant_sale_idx"
  ON "sale_refunds" ("tenant_id", "sale_id");
CREATE INDEX "sale_refunds_tenant_branch_occurred_idx"
  ON "sale_refunds" ("tenant_id", "branch_id", "occurred_at" DESC);
CREATE INDEX "sale_refunds_tenant_deleted_idx"
  ON "sale_refunds" ("tenant_id", "deleted_at");

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON "sale_refunds"
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE "sale_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_refunds"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "sale_refunds"
  ADD CONSTRAINT "sale_refunds_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT;

ALTER TABLE "sale_refunds"
  ADD CONSTRAINT "sale_refunds_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "cashier_shifts"("id") ON DELETE SET NULL;

-- ── sale_refund_lines ──────────────────────────────────────────────
CREATE TABLE "sale_refund_lines" (
    "id"                         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                  UUID         NOT NULL,
    "refund_id"                  UUID         NOT NULL,
    "sale_line_id"               UUID         NOT NULL,
    "qty"                        INT          NOT NULL,
    "unit_price_snapshot_cents"  BIGINT       NOT NULL,
    "tax_snapshot_cents"         BIGINT       NOT NULL DEFAULT 0,
    "line_total_cents"           BIGINT       NOT NULL,
    "restock"                    BOOLEAN      NOT NULL DEFAULT true,
    "created_at"                 TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_refund_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_refund_lines_qty_positive" CHECK ("qty" > 0)
);

CREATE INDEX "sale_refund_lines_tenant_refund_idx"
  ON "sale_refund_lines" ("tenant_id", "refund_id");
CREATE INDEX "sale_refund_lines_tenant_sale_line_idx"
  ON "sale_refund_lines" ("tenant_id", "sale_line_id");

ALTER TABLE "sale_refund_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_refund_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_refund_lines"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "sale_refund_lines"
  ADD CONSTRAINT "sale_refund_lines_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "sale_refunds"("id") ON DELETE CASCADE;
ALTER TABLE "sale_refund_lines"
  ADD CONSTRAINT "sale_refund_lines_sale_line_id_fkey"
  FOREIGN KEY ("sale_line_id") REFERENCES "sale_lines"("id") ON DELETE RESTRICT;

-- ── sale_refund_payments ───────────────────────────────────────────
-- Mirrors sale_payments. Refund disbursements: cash hands back at the drawer,
-- bank_transfer is a tracked external obligation, store_credit creates a
-- positive store_credit_ledger entry.
CREATE TABLE "sale_refund_payments" (
    "id"                     UUID            NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"              UUID            NOT NULL,
    "refund_id"              UUID            NOT NULL,
    "method"                 "PaymentMethod" NOT NULL,
    "amount_cents"           BIGINT          NOT NULL,
    "approval_code"          TEXT,
    "store_credit_ledger_id" UUID,
    "created_at"             TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_refund_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_refund_payments_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE INDEX "sale_refund_payments_tenant_refund_idx"
  ON "sale_refund_payments" ("tenant_id", "refund_id");

ALTER TABLE "sale_refund_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_refund_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_refund_payments"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "sale_refund_payments"
  ADD CONSTRAINT "sale_refund_payments_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "sale_refunds"("id") ON DELETE CASCADE;

-- ── denormalized counter on sales ──────────────────────────────────
ALTER TABLE "sales"
  ADD COLUMN "refunded_amount_cents" BIGINT NOT NULL DEFAULT 0;
