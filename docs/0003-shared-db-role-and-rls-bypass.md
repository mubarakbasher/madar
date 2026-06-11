# ADR 0003 — Shared DB role + GUC-based RLS bypass (accepted risk, split deferred)

**Status:** adopted 2026-06-11 · **Relates to:** audit findings M-19, M-20 (`docs/audit-2026-06-10.md`)

## Context

Both Prisma clients (`tenantScoped`, `adminPrisma`) connect as the single
runtime role `madar_app`. Tenant isolation rests on RLS policies that read two
unprivileged session variables:

- `app.current_tenant_id` — set per-query by `tenantScoped`
- `app.is_super_admin` — set per-query by `adminPrisma`; every policy contains
  the bypass branch `current_setting('app.is_super_admin', true) = 'true'`

Postgres allows ANY session to set unreserved `app.*` GUCs. Therefore the only
barrier between a tenant-realm request and a full cross-tenant read is
application code: if an attacker ever achieves SQL injection (none exists
today — every raw call site was audited and is parameterized) they can
`SELECT set_config('app.is_super_admin','true',false)` and read all tenants.

## Decision

Keep the shared-role design for now; defer the role split to its own PR.
Mitigations in place:

1. All raw SQL is parameterized (verified 2026-06-10; re-verify in review for
   any new `$queryRawUnsafe`).
2. ESLint fences: `adminPrisma`/`basePrisma` banned in `src/tenant`,
   `tenantScoped`/`basePrisma` banned in `src/admin`, and `$transaction` on
   extended clients banned repo-wide (`apps/api/.eslintrc.json`).
3. `pnpm test:rls` asserts fail-closed behavior for unset GUCs.

## Planned design (when implemented)

- New `madar_admin` LOGIN role; `adminPrisma` connects via a second
  `ADMIN_DATABASE_URL` connection string.
- RLS policies split: `tenant_isolation FOR ALL TO madar_app USING
  (tenant_id = …)` without any bypass branch, plus
  `admin_full_access FOR ALL TO madar_admin USING (true)`.
- `app.is_super_admin` GUC removed entirely — the role IS the privilege.
- Tenant realm keeps `madar_app`, which then has no bypass path at any layer.

## Operational note (M-20)

Migration `20260514010000_app_role` creates `madar_app` with the literal
password `madar_app` (migrations are immutable). **Production deploys must
rotate it post-migration:**

```sql
ALTER ROLE madar_app WITH PASSWORD '<strong-generated-secret>';
```

and set the rotated credentials in `DATABASE_URL`. This step is part of
`docs/deployment.md`.
