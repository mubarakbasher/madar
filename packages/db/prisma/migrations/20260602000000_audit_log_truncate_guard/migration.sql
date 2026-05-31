-- Audit-log append-only: close the TRUNCATE gap.
--
-- The init migration (20260514000000_init) already blocks UPDATE and DELETE on
-- both audit tables via BEFORE UPDATE / BEFORE DELETE row triggers calling
-- fn_audit_log_append_only(). But row-level triggers DO NOT fire on TRUNCATE —
-- a single `TRUNCATE audit_log` would wipe all history without tripping them.
-- TRUNCATE triggers must be statement-level (FOR EACH STATEMENT); the existing
-- function works unchanged since it only RAISEs (TG_OP = 'TRUNCATE' here).

CREATE TRIGGER audit_log_block_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION fn_audit_log_append_only();
CREATE TRIGGER platform_audit_log_block_truncate BEFORE TRUNCATE ON platform_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION fn_audit_log_append_only();

-- Defense-in-depth: the runtime app role should not even hold the mutating
-- verbs on the audit tables. 20260514010000_app_role granted SELECT/INSERT/
-- UPDATE/DELETE on ALL tables; revoke the mutating ones here so the app can only
-- ever append. TRUNCATE was never granted, so revoking it is a harmless no-op.
-- SELECT + INSERT remain. The triggers above are the backstop for any role
-- (including the superuser owner) that still holds the privilege.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM madar_app;
REVOKE UPDATE, DELETE, TRUNCATE ON platform_audit_log FROM madar_app;
