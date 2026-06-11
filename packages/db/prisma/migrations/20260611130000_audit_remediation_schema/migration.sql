-- Audit remediation schema sweep (L-13, L-14, L-15, L-18) — see
-- docs/audit-2026-06-10.md.

-- ── L-13: stock_movements gains a sibling currency for unit_cost_cents ──
-- Multi-currency tenants need the ledger to snapshot WHICH currency a
-- movement's cost was recorded in. Backfill from the branch's currency.
ALTER TABLE "stock_movements" ADD COLUMN "currency_code" VARCHAR(3);
UPDATE "stock_movements" sm
SET "currency_code" = b."currency_code"
FROM "branches" b
WHERE b."id" = sm."branch_id" AND sm."currency_code" IS NULL;

-- ── L-18: sync_conflicts mutates on review → needs updated_at ──────────
ALTER TABLE "sync_conflicts"
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TRIGGER sync_conflicts_set_updated_at BEFORE UPDATE ON "sync_conflicts"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── L-15: a hard customer delete must not erase store-credit history ───
ALTER TABLE "store_credit_ledger" DROP CONSTRAINT "store_credit_ledger_customer_fk";
ALTER TABLE "store_credit_ledger"
  ADD CONSTRAINT "store_credit_ledger_customer_fk"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT;

-- ── L-14: soft-delete-aware uniqueness ──────────────────────────────────
-- Full unique constraints meant a soft-deleted user/product/customer
-- permanently blocked re-using their email/SKU/phone/code. Recreate each as
-- a partial unique index (same name, so P2002 handling keyed on index names
-- keeps working) scoped to live rows.
DROP INDEX "users_tenant_id_email_key";
CREATE UNIQUE INDEX "users_tenant_id_email_key"
  ON "users"("tenant_id", "email") WHERE "deleted_at" IS NULL;

DROP INDEX "branches_tenant_id_code_key";
CREATE UNIQUE INDEX "branches_tenant_id_code_key"
  ON "branches"("tenant_id", "code") WHERE "deleted_at" IS NULL;

DROP INDEX "categories_tenant_id_code_key";
CREATE UNIQUE INDEX "categories_tenant_id_code_key"
  ON "categories"("tenant_id", "code") WHERE "deleted_at" IS NULL;

DROP INDEX "products_tenant_id_sku_key";
CREATE UNIQUE INDEX "products_tenant_id_sku_key"
  ON "products"("tenant_id", "sku") WHERE "deleted_at" IS NULL;

DROP INDEX "customers_tenant_id_phone_key";
CREATE UNIQUE INDEX "customers_tenant_id_phone_key"
  ON "customers"("tenant_id", "phone") WHERE "deleted_at" IS NULL;

DROP INDEX "customers_tenant_id_email_key";
CREATE UNIQUE INDEX "customers_tenant_id_email_key"
  ON "customers"("tenant_id", "email") WHERE "deleted_at" IS NULL;
