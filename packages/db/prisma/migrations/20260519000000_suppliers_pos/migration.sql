-- Phase 2.3 — suppliers, purchase orders, supplier returns (RMAs), documents.
--
-- Seven tenant-scoped tables forming the supplier-side counterpart of the
-- sales module. All carry the standard tenant_id + soft-delete + audit
-- columns, RLS enabled+forced with the canonical NULLIF tenant_isolation
-- policy (see 20260514020000_rls_policy_nullif/migration.sql for why the
-- NULLIF wrapper is mandatory), and an updated_at trigger backed by the
-- existing fn_set_updated_at() function from the init migration.
--
-- State machines:
--   purchase_orders:   draft → ordered → received | cancelled
--   supplier_returns:  draft → sent → refunded | cancelled
--
-- Note: per the Phase 2.3 plan, the existing StockMovementKind 'receive'
-- value is reused for PO receipts — no enum change here. Lifecycle
-- columns on the header tables (ordered_at/by, received_at/by, etc.)
-- are populated by the service layer, never by triggers.

-- ── enums ───────────────────────────────────────────────────────────
CREATE TYPE "PurchaseOrderStatus"  AS ENUM ('draft', 'ordered', 'received', 'cancelled');
CREATE TYPE "SupplierReturnStatus" AS ENUM ('draft', 'sent', 'refunded', 'cancelled');
CREATE TYPE "DocumentKind"         AS ENUM ('contract', 'tax_certificate', 'bank_letter', 'other');

-- ── suppliers ───────────────────────────────────────────────────────
CREATE TABLE "suppliers" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID         NOT NULL,
    "code"           TEXT         NOT NULL,
    "name_i18n"      JSONB        NOT NULL,
    "country_code"   CHAR(2),
    "currency_code"  CHAR(3)      NOT NULL,
    "lead_time_days" INT,
    "payment_terms"  TEXT,
    "contact_email"  TEXT,
    "contact_phone"  TEXT,
    "address_i18n"   JSONB,
    "tax_id"         TEXT,
    "notes"          TEXT,
    "is_active"      BOOLEAN      NOT NULL DEFAULT true,
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"     UUID,
    "deleted_at"     TIMESTAMPTZ,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_tenant_code_unique"
  ON "suppliers" ("tenant_id", "code");
CREATE INDEX "suppliers_tenant_deleted_idx"
  ON "suppliers" ("tenant_id", "deleted_at");
CREATE INDEX "suppliers_tenant_active_idx"
  ON "suppliers" ("tenant_id", "is_active");

-- ── supplier_products ──────────────────────────────────────────────
CREATE TABLE "supplier_products" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL,
    "supplier_id"     UUID         NOT NULL,
    "product_id"      UUID         NOT NULL,
    "supplier_sku"    TEXT,
    "unit_cost_cents" BIGINT       NOT NULL,
    "currency_code"   CHAR(3)      NOT NULL,
    "is_preferred"    BOOLEAN      NOT NULL DEFAULT false,
    "effective_from"  DATE,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"      UUID,
    "deleted_at"      TIMESTAMPTZ,
    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_products_supplier_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE,
    CONSTRAINT "supplier_products_product_fk"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "supplier_products_tenant_supplier_product_unique"
  ON "supplier_products" ("tenant_id", "supplier_id", "product_id");

-- At most one preferred supplier per product per tenant (live rows only).
CREATE UNIQUE INDEX "supplier_products_one_preferred_per_product"
  ON "supplier_products" ("tenant_id", "product_id")
  WHERE "is_preferred" = true AND "deleted_at" IS NULL;

CREATE INDEX "supplier_products_tenant_supplier_idx"
  ON "supplier_products" ("tenant_id", "supplier_id");
CREATE INDEX "supplier_products_tenant_deleted_idx"
  ON "supplier_products" ("tenant_id", "deleted_at");

-- ── purchase_orders ────────────────────────────────────────────────
CREATE TABLE "purchase_orders" (
    "id"             UUID                  NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID                  NOT NULL,
    "code"           TEXT                  NOT NULL,
    "supplier_id"    UUID                  NOT NULL,
    "branch_id"      UUID                  NOT NULL,
    "status"         "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "currency_code"  CHAR(3)               NOT NULL,
    "expected_at"    DATE,
    "subtotal_cents" BIGINT                NOT NULL DEFAULT 0,
    "tax_cents"      BIGINT                NOT NULL DEFAULT 0,
    "shipping_cents" BIGINT                NOT NULL DEFAULT 0,
    "total_cents"    BIGINT                NOT NULL DEFAULT 0,
    "notes"          TEXT,
    "ordered_at"     TIMESTAMPTZ,
    "ordered_by"     UUID,
    "received_at"    TIMESTAMPTZ,
    "received_by"    UUID,
    "cancelled_at"   TIMESTAMPTZ,
    "cancelled_by"   UUID,
    "created_at"     TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"     UUID,
    "deleted_at"     TIMESTAMPTZ,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_orders_supplier_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION,
    CONSTRAINT "purchase_orders_branch_fk"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE NO ACTION
);

CREATE UNIQUE INDEX "purchase_orders_tenant_code_unique"
  ON "purchase_orders" ("tenant_id", "code");
CREATE INDEX "purchase_orders_tenant_status_created_idx"
  ON "purchase_orders" ("tenant_id", "status", "created_at" DESC);
CREATE INDEX "purchase_orders_tenant_supplier_idx"
  ON "purchase_orders" ("tenant_id", "supplier_id");
CREATE INDEX "purchase_orders_tenant_branch_idx"
  ON "purchase_orders" ("tenant_id", "branch_id");
CREATE INDEX "purchase_orders_tenant_deleted_idx"
  ON "purchase_orders" ("tenant_id", "deleted_at");

-- ── purchase_order_lines ───────────────────────────────────────────
CREATE TABLE "purchase_order_lines" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID         NOT NULL,
    "po_id"            UUID         NOT NULL,
    "product_id"       UUID         NOT NULL,
    "qty_ordered"      INT          NOT NULL,
    "qty_received"     INT,
    "unit_cost_cents"  BIGINT       NOT NULL,
    "line_total_cents" BIGINT       NOT NULL,
    "discrepancy_note" TEXT,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"       UUID,
    "deleted_at"       TIMESTAMPTZ,
    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_lines_qty_ordered_positive"
      CHECK ("qty_ordered" > 0),
    CONSTRAINT "purchase_order_lines_qty_received_nonneg"
      CHECK ("qty_received" IS NULL OR "qty_received" >= 0),
    CONSTRAINT "purchase_order_lines_po_fk"
      FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "purchase_order_lines_product_fk"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION
);

CREATE UNIQUE INDEX "purchase_order_lines_tenant_po_product_unique"
  ON "purchase_order_lines" ("tenant_id", "po_id", "product_id");
CREATE INDEX "purchase_order_lines_tenant_po_idx"
  ON "purchase_order_lines" ("tenant_id", "po_id");

-- ── supplier_returns ───────────────────────────────────────────────
CREATE TABLE "supplier_returns" (
    "id"            UUID                   NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID                   NOT NULL,
    "code"          TEXT                   NOT NULL,
    "supplier_id"   UUID                   NOT NULL,
    "branch_id"     UUID                   NOT NULL,
    "status"        "SupplierReturnStatus" NOT NULL DEFAULT 'draft',
    "currency_code" CHAR(3)                NOT NULL,
    "total_cents"   BIGINT                 NOT NULL DEFAULT 0,
    "reason"        TEXT                   NOT NULL,
    "notes"         TEXT,
    "sent_at"       TIMESTAMPTZ,
    "sent_by"       UUID,
    "refunded_at"   TIMESTAMPTZ,
    "refunded_by"   UUID,
    "cancelled_at"  TIMESTAMPTZ,
    "cancelled_by"  UUID,
    "created_at"    TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"    UUID,
    "deleted_at"    TIMESTAMPTZ,
    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_returns_supplier_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION,
    CONSTRAINT "supplier_returns_branch_fk"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE NO ACTION
);

CREATE UNIQUE INDEX "supplier_returns_tenant_code_unique"
  ON "supplier_returns" ("tenant_id", "code");
CREATE INDEX "supplier_returns_tenant_status_created_idx"
  ON "supplier_returns" ("tenant_id", "status", "created_at" DESC);
CREATE INDEX "supplier_returns_tenant_supplier_idx"
  ON "supplier_returns" ("tenant_id", "supplier_id");
CREATE INDEX "supplier_returns_tenant_branch_idx"
  ON "supplier_returns" ("tenant_id", "branch_id");
CREATE INDEX "supplier_returns_tenant_deleted_idx"
  ON "supplier_returns" ("tenant_id", "deleted_at");

-- ── supplier_return_lines ──────────────────────────────────────────
CREATE TABLE "supplier_return_lines" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID         NOT NULL,
    "return_id"        UUID         NOT NULL,
    "product_id"       UUID         NOT NULL,
    "qty"              INT          NOT NULL,
    "unit_cost_cents"  BIGINT       NOT NULL,
    "line_total_cents" BIGINT       NOT NULL,
    "reason_code"      TEXT,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"       UUID,
    "deleted_at"       TIMESTAMPTZ,
    CONSTRAINT "supplier_return_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_return_lines_qty_positive" CHECK ("qty" > 0),
    CONSTRAINT "supplier_return_lines_return_fk"
      FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id") ON DELETE CASCADE,
    CONSTRAINT "supplier_return_lines_product_fk"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION
);

CREATE UNIQUE INDEX "supplier_return_lines_tenant_return_product_unique"
  ON "supplier_return_lines" ("tenant_id", "return_id", "product_id");
CREATE INDEX "supplier_return_lines_tenant_return_idx"
  ON "supplier_return_lines" ("tenant_id", "return_id");

-- ── supplier_documents ─────────────────────────────────────────────
CREATE TABLE "supplier_documents" (
    "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID            NOT NULL,
    "supplier_id"       UUID            NOT NULL,
    "kind"              "DocumentKind"  NOT NULL,
    "file_path"         TEXT            NOT NULL,
    "original_filename" TEXT            NOT NULL,
    "mime_type"         TEXT            NOT NULL,
    "size_bytes"        INT             NOT NULL,
    "uploaded_by"       UUID,
    "notes"             TEXT,
    "created_at"        TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"        UUID,
    "deleted_at"        TIMESTAMPTZ,
    CONSTRAINT "supplier_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_documents_supplier_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE
);

CREATE INDEX "supplier_documents_tenant_supplier_deleted_idx"
  ON "supplier_documents" ("tenant_id", "supplier_id", "deleted_at");
CREATE INDEX "supplier_documents_tenant_kind_idx"
  ON "supplier_documents" ("tenant_id", "kind");

-- ── updated_at triggers (mirror init migration pattern) ────────────
CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON "suppliers"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER supplier_products_set_updated_at BEFORE UPDATE ON "supplier_products"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER purchase_orders_set_updated_at BEFORE UPDATE ON "purchase_orders"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER purchase_order_lines_set_updated_at BEFORE UPDATE ON "purchase_order_lines"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER supplier_returns_set_updated_at BEFORE UPDATE ON "supplier_returns"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER supplier_return_lines_set_updated_at BEFORE UPDATE ON "supplier_return_lines"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER supplier_documents_set_updated_at BEFORE UPDATE ON "supplier_documents"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS (mirror init migration pattern; NULLIF cast per 20260514020000) ──
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suppliers"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "supplier_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_products" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_products"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_orders"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_order_lines"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "supplier_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_returns"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "supplier_return_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_return_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_return_lines"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE "supplier_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_documents"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );
