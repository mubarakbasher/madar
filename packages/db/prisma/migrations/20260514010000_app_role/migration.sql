-- Non-superuser app role for runtime queries.
--
-- Why this migration exists: the `madar` role is the table owner and is created
-- by docker-compose as a Postgres SUPERUSER (any role set via POSTGRES_USER on
-- the official image is a superuser). Superusers bypass row-level security
-- unconditionally — FORCE ROW LEVEL SECURITY does not help, the policy never
-- runs. With only one superuser role, RLS is plumbed correctly but never
-- enforced for app queries.
--
-- The fix is a second role:
--   * `madar`     — superuser table owner. Used by `prisma migrate` via
--                   DIRECT_DATABASE_URL. Has full DDL.
--   * `madar_app` — non-superuser runtime role. Used by the app via
--                   DATABASE_URL. RLS policies apply to it. The adminPrisma
--                   client bypasses RLS by setting `app.is_super_admin='true'`,
--                   which the tenant_isolation policy explicitly allows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'madar_app') THEN
    CREATE ROLE madar_app LOGIN PASSWORD 'madar_app' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
END $$;

GRANT CONNECT ON DATABASE madar TO madar_app;
GRANT USAGE ON SCHEMA public TO madar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO madar_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO madar_app;

-- Tables created in future migrations (running as madar) also need to be
-- visible/writable to madar_app. Default privileges handle that.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO madar_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO madar_app;
