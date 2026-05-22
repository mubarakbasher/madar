-- Fix tenant_isolation: cast was unsafe when app.current_tenant_id is unset.
--
-- The previous policy was:
--   USING (
--     current_setting('app.is_super_admin', true) = 'true'
--     OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
--   )
--
-- When neither GUC is set, current_setting(..., true) returns '' (empty
-- string). ''::uuid raises SQLSTATE 22P02. Postgres does NOT guarantee
-- short-circuit OR evaluation, so even an adminPrisma query with
-- is_super_admin=true would still evaluate the right side and error out.
-- The fix wraps the GUC in NULLIF so an unset value becomes NULL (a no-op
-- for the cast).
--
-- This migration was caught by runtime verification — until then the bug was
-- hidden because the only available role was a superuser, which bypassed
-- the policy entirely.

DO $$
DECLARE
  t text;
  tenant_scoped_tables text[] := ARRAY[
    'users', 'branches', 'categories', 'products', 'customers',
    'tenant_bank_accounts', 'branch_stock', 'stock_movements',
    'sales', 'sale_lines', 'payment_proofs', 'subscription_invoices', 'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_scoped_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $f$
        CREATE POLICY tenant_isolation ON %I
          USING (
            current_setting('app.is_super_admin', true) = 'true'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          )
          WITH CHECK (
            current_setting('app.is_super_admin', true) = 'true'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          )
      $f$,
      t
    );
  END LOOP;
END $$;
