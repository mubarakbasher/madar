# ADR 0004 — `madar_admin` role split (supersedes the deferral in ADR 0003)

**Status:** adopted 2026-06-12 · **Supersedes:** the "split deferred" decision of ADR 0003 (which remains the record of the interim accepted risk)

## Context

ADR 0003 documented audit finding M-19: both Prisma clients connected as the
single role `madar_app`, and every RLS policy carried the bypass branch
`current_setting('app.is_super_admin', true) = 'true'` — an unreserved GUC
any session can set, so one SQL injection in the tenant realm escalated to
reading every tenant at once.

## Decision

Implement the split designed in ADR 0003 (migration
`20260612000000_admin_role_split`):

1. **New login role `madar_admin`** (non-superuser), used exclusively by
   `adminPrisma` via `ADMIN_DATABASE_URL`. Same grants pattern as
   `madar_app`, including the audit-log `REVOKE UPDATE, DELETE, TRUNCATE`
   (both audit tables stay append-only for the admin realm too).
2. **Role-scoped policies on all 34 tenant tables:**
   - `tenant_isolation FOR ALL TO madar_app` — only the NULLIF
     `app.current_tenant_id` branch; the super-admin clause is gone.
   - `admin_full_access FOR ALL TO madar_admin USING (true) WITH CHECK (true)`.
3. **`app.is_super_admin` is dead.** No code sets it; setting it grants
   nothing (regression canary in `packages/db/test/rls.test.ts`).
4. `adminPrisma` becomes a **plain (non-extended) PrismaClient** on the admin
   URL — interactive `$transaction`s on it are real single-connection
   transactions, removing the last extended-client quirk (`withAdminTx`
   simply delegates).

## Consequences

- Three connection strings: `DATABASE_URL` (madar_app, tenant realm),
  `ADMIN_DATABASE_URL` (madar_admin, super-admin realm),
  `DIRECT_DATABASE_URL` (superuser, migrations only). Prod compose builds the
  first two from `MADAR_APP_PASSWORD` / `MADAR_ADMIN_PASSWORD`; both roles are
  created with placeholder passwords by migrations and **must be rotated**
  post-deploy (`docs/deployment.md` §5b).
- The realm boundary is now enforced at THREE layers: separate JWT secrets,
  separate Prisma clients (lint-fenced per directory), separate DB roles.
- **Residual risk (unchanged, documented):** `app.current_tenant_id` is still
  a GUC, so SQL injection as `madar_app` could cross between tenants **one at
  a time** by re-pointing the context. Eliminating that requires per-tenant
  DB roles or moving scoping fully out of session state — revisit only if a
  raw-SQL injection vector ever appears (all current raw SQL is parameterized
  and re-audited per PR).
