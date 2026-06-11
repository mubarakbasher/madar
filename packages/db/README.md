# @madar/db

Prisma schema, migrations, and tenant-aware Postgres clients for Madar.

## Two clients, two realms

- `tenantScoped(tenantId)` — for the tenant app (`apps/web`) and tenant-realm API routes (`apps/api/src/tenant`). Connects as `madar_app` and sets `app.current_tenant_id` per query so PostgreSQL RLS filters every row to that tenant.
- `adminPrisma` — for the super-admin app (`apps/admin`) and admin-realm API routes (`apps/api/src/admin`). A plain client connecting as the dedicated `madar_admin` role (`ADMIN_DATABASE_URL`); its `admin_full_access` policy is the cross-tenant path. **The role is the privilege** — there is no session-variable bypass (ADR 0004).

**Never** use `tenantScoped` in admin code or `adminPrisma` in tenant code. The whole multi-tenancy safety net rests on that boundary.

## How tenant RLS is plumbed

`tenantScoped` wraps `$allOperations` and chains `set_config(...)` with the actual query inside a single `$transaction`:

```ts
basePrisma.$transaction([
  basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
  query(args),
]);
```

This pattern matters because `set_config(..., TRUE)` is transaction-local (equivalent to `SET LOCAL`). Without the surrounding `$transaction`, Prisma would run each statement in its own implicit transaction and the session variable would evaporate before the next query — silently breaking isolation.

Because of that wrapper, `tenantScoped(...).$transaction(async …)` is NOT atomic — multi-step tenant writes must use `withTenantTx()` from `apps/api/src/shared/db-tx.ts` (lint-enforced). `adminPrisma` is unextended, so interactive transactions on it are real transactions.

## Three database roles

RLS is only enforced for non-superusers. Postgres superusers (and the
table-owning role, unless `FORCE ROW LEVEL SECURITY` is set) bypass the policy
unconditionally. The `POSTGRES_USER` set by docker-compose is a superuser —
so we use **three roles**:

| Role | Used by | Env var | RLS policy |
|---|---|---|---|
| `madar` | `prisma migrate`, tests' `migrate reset` | `DIRECT_DATABASE_URL` | None (superuser + table owner) |
| `madar_app` | tenant realm at runtime (`tenantScoped`) | `DATABASE_URL` | `tenant_isolation` (NULLIF on `app.current_tenant_id`) |
| `madar_admin` | super-admin realm (`adminPrisma`) | `ADMIN_DATABASE_URL` | `admin_full_access` (USING true) |

`madar_app` is created by migration `20260514010000_app_role`, `madar_admin`
by `20260612000000_admin_role_split`. If you bring up a fresh database, both
must apply before the app can connect. Both are created with placeholder
passwords — production rotates them (docs/deployment.md §5b).

## PgBouncer

Production deployments must use PgBouncer in **transaction-pooling** or **session-pooling** mode. **Statement-pooling mode is forbidden** because it would split `SET` from `SELECT` across different backend connections and silently break tenant isolation.

## Migration discipline

- Migrations are immutable once merged to `main`. Fixes ship as a new numbered migration.
- `001_init` is hand-edited after generation to append RLS policies and triggers, because Prisma doesn't generate either. From the commit that lands it, the file is frozen.
- Every tenant-scoped table is created with `ENABLE` **and** `FORCE` row level security. `FORCE` is required so the table owner (the migration role) also obeys the policy — without it the canary RLS test passes vacuously.

## Scripts

| Script | What it does |
|---|---|
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Apply pending migrations (dev) |
| `pnpm db:migrate:deploy` | Apply migrations in production / CI |
| `pnpm db:reset` | Drop and re-apply all migrations + seed (DESTRUCTIVE) |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:seed` | Seed demo tenant "Bayt Coffee Co. / بيت كوفي" + super-admin |
| `pnpm test:rls` | Per-model cross-tenant isolation assertion (CRITICAL) |
| `pnpm typecheck` | TypeScript-only check |
