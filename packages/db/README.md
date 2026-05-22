# @madar/db

Prisma schema, migrations, and tenant-aware Postgres clients for Madar.

## Two clients, two realms

- `tenantScoped(tenantId)` — for the tenant app (`apps/web`) and tenant-realm API routes (`apps/api/src/tenant`). Sets `app.current_tenant_id` per query so PostgreSQL RLS filters every row to that tenant.
- `adminPrisma` — for the super-admin app (`apps/admin`) and admin-realm API routes (`apps/api/src/admin`). Sets `app.is_super_admin = true`, bypassing RLS for cross-tenant queries.

**Never** use `tenantScoped` in admin code or `adminPrisma` in tenant code. The whole multi-tenancy safety net rests on that boundary.

## How RLS is plumbed

Each client wraps `$allOperations` and chains `set_config(...)` with the actual query inside a single `$transaction`:

```ts
basePrisma.$transaction([
  basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
  query(args),
]);
```

This pattern matters because `set_config(..., TRUE)` is transaction-local (equivalent to `SET LOCAL`). Without the surrounding `$transaction`, Prisma would run each statement in its own implicit transaction and the session variable would evaporate before the next query — silently breaking isolation.

## Two database roles

RLS is only enforced for non-superusers. Postgres superusers (and the
table-owning role, unless `FORCE ROW LEVEL SECURITY` is set) bypass the policy
unconditionally. The `POSTGRES_USER` set by docker-compose is a superuser —
so we use **two roles**:

| Role | Used by | Env var | Subject to RLS? |
|---|---|---|---|
| `madar` | `prisma migrate`, tests' `migrate reset` | `DIRECT_DATABASE_URL` | No (superuser + table owner) |
| `madar_app` | the app at runtime — both `tenantScoped` and `adminPrisma` | `DATABASE_URL` | **Yes** |

`adminPrisma` still works because the `tenant_isolation` policy explicitly
allows rows through when `current_setting('app.is_super_admin')='true'`. That
GUC is what bypasses RLS — not role attributes.

`madar_app` is created by migration `20260514010000_app_role`. If you bring
up a fresh database, that migration must apply before the app can connect.

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
