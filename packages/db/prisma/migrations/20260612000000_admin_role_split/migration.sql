-- Admin role split (ADR 0004, audit finding M-19).
--
-- Before this migration both Prisma clients connected as `madar_app`, and
-- every tenant_isolation policy carried the bypass branch
-- `current_setting('app.is_super_admin', true) = 'true'`. Postgres lets ANY
-- session set unreserved `app.*` GUCs, so a single SQL injection in the
-- tenant realm could escalate to reading every tenant at once.
--
-- After: the privilege IS the role.
--   * `madar_app`   — tenant realm. tenant_isolation policy (NULLIF pattern)
--                     applies; there is no bypass branch to flip.
--   * `madar_admin` — admin realm (adminPrisma via ADMIN_DATABASE_URL).
--                     admin_full_access policy grants everything.
--   * `madar`       — superuser owner, migrations only (unchanged).
--
-- Residual (documented in ADR 0004): `app.current_tenant_id` remains a GUC,
-- so SQLi as madar_app could still cross between tenants ONE AT A TIME.
-- Closing that needs per-tenant roles; out of scope.

-- ── 1. Role ─────────────────────────────────────────────────────────────
-- Placeholder password, same caveat as madar_app: production MUST rotate it
-- post-migration (docs/deployment.md §5b).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'madar_admin') THEN
    CREATE ROLE madar_admin LOGIN PASSWORD 'madar_admin' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
END $$;

GRANT CONNECT ON DATABASE madar TO madar_admin;
GRANT USAGE ON SCHEMA public TO madar_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO madar_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO madar_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO madar_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO madar_admin;

-- Audit logs stay append-only for the admin realm too (SELECT + INSERT
-- remain — the admin writes platform audit rows and mirrors impersonation
-- rows into tenant audit_log).
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM madar_admin;
REVOKE UPDATE, DELETE, TRUNCATE ON platform_audit_log FROM madar_admin;

-- ── 2. Role-scoped policies ─────────────────────────────────────────────
-- Recreate tenant_isolation WITHOUT the super-admin branch, scoped TO
-- madar_app, and add admin_full_access TO madar_admin. The DO loop covers
-- every tenant-scoped table (this also normalizes notification_preferences,
-- whose original policy used a tenant_id::text cast variant).
--
-- The table owner (`madar`) is a superuser in every environment, so despite
-- FORCE ROW LEVEL SECURITY it bypasses policies entirely — migrations,
-- seeds-by-superuser, and pg_dump backups are unaffected by the policies
-- now being role-scoped.
DO $$
DECLARE
  t text;
  tenant_scoped_tables text[] := ARRAY[
    'users', 'branches', 'categories', 'products', 'customers',
    'tenant_bank_accounts', 'branch_stock', 'stock_movements',
    'sales', 'sale_lines', 'payment_proofs', 'subscription_invoices',
    'audit_log',
    'stock_transfers', 'stock_transfer_lines',
    'suppliers', 'supplier_products', 'purchase_orders',
    'purchase_order_lines', 'supplier_returns', 'supplier_return_lines',
    'supplier_documents',
    'tax_classes', 'held_sales', 'held_sale_lines', 'store_credit_ledger',
    'sale_payments',
    'sync_conflicts',
    'scheduled_reports',
    'cashier_shifts',
    'sale_refunds', 'sale_refund_lines', 'sale_refund_payments',
    'notification_preferences'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_scoped_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_full_access ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        FOR ALL TO madar_app
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY admin_full_access ON %I
        FOR ALL TO madar_admin
        USING (true)
        WITH CHECK (true)
    $f$, t);
  END LOOP;
END $$;
