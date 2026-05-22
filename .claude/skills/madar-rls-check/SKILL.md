---
name: madar-rls-check
description: Audit the working tree for violations of the multi-tenancy rules from CLAUDE.md — raw prisma usage in tenant code, cross-realm Prisma client misuse, missing RLS policies on new migrations, money columns as floats, controllers without the right auth guard. Run before any commit that touches data layer, schema, or API code. A tenant data leak is "an extinction-level event" per CLAUDE.md, so this check is cheap insurance.
---

# madar-rls-check

The cheapest defense against the most expensive bug. Audit changed code for the non-negotiable multi-tenancy rules from `CLAUDE.md`.

## Run

```bash
# Check only files changed since last commit (typical use)
git diff --name-only HEAD | xargs -I {} ls {} 2>/dev/null

# Or pass an explicit list of files to inspect
```

## What to look for

### 1. Raw Prisma usage in tenant code

**Forbidden in `apps/web/` and `apps/api/src/tenant/`:**
- `prisma.<model>.findMany(`
- `prisma.<model>.create(`
- `prisma.<model>.update(`
- `prisma.<model>.delete(`
- `new PrismaClient(`

**Required pattern:** `tenantScoped(req).<model>.findMany(...)`

```bash
grep -rEn 'prisma\.\w+\.(findMany|findFirst|findUnique|create|createMany|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)' apps/web apps/api/src/tenant 2>/dev/null
```

Any hit that's not inside `// seed`, `// migration`, or `prisma.$transaction(` legitimately is a violation.

### 2. Cross-realm client misuse

**`adminPrisma` must NEVER appear in:**
- `apps/web/`
- `apps/api/src/tenant/`
- `apps/api/src/shared/` (unless explicitly admin-context aware)

```bash
grep -rn 'adminPrisma' apps/web apps/api/src/tenant 2>/dev/null
```

**`tenantScoped` must NEVER appear in:**
- `apps/admin/`
- `apps/api/src/admin/`

```bash
grep -rn 'tenantScoped' apps/admin apps/api/src/admin 2>/dev/null
```

Either hit is a critical violation. Stop and report.

### 3. Missing RLS policies on new tables

For every new migration in `packages/db/prisma/migrations/*/migration.sql`:
- If the migration creates a tenant-scoped table (anything except `tenants`, `platform_users`, `platform_audit_log`, `platform_bank_accounts`, `plans`, `feature_flags`), there MUST be:
  - `tenant_id uuid NOT NULL` column
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
  - A policy that filters by `current_setting('app.current_tenant_id')`
  - A policy that bypasses for `current_setting('app.is_super_admin') = 'true'`
  - Standard audit columns: `created_at`, `updated_at`, `created_by`, `deleted_at`

```bash
for f in packages/db/prisma/migrations/*/migration.sql; do
  if grep -q 'CREATE TABLE' "$f"; then
    echo "=== $f ==="
    grep -E '(CREATE TABLE|tenant_id|ENABLE ROW LEVEL SECURITY|CREATE POLICY)' "$f"
  fi
done
```

Any new `CREATE TABLE` without the four required artifacts is a violation.

### 4. Money columns

Search for money-like columns declared as floats/decimals:
```bash
grep -rEn '(amount|total|price|cost|balance|subtotal|tax|discount)\s+(decimal|float|Float|Decimal|numeric)' packages/db/prisma 2>/dev/null
```

Money must be `bigint` cents + sibling `currency_code`. Per `CLAUDE.md`: 19.99 SAR → `1999`.

### 5. Auth guards on controllers

Every new controller method under `apps/api/src/tenant/` must be protected by `@UseGuards(TenantAuthGuard)` (class- or method-level). Same for admin → `AdminAuthGuard`.

```bash
# Tenant controllers missing TenantAuthGuard
grep -L 'TenantAuthGuard' apps/api/src/tenant/**/*.controller.ts 2>/dev/null

# Admin controllers missing AdminAuthGuard
grep -L 'AdminAuthGuard' apps/api/src/admin/**/*.controller.ts 2>/dev/null
```

Endpoints meant to be public must be explicitly `@Public()` decorated — silence is not authorization.

### 6. Stock invariant

Any code that writes to `branch_stock.qty_on_hand` MUST also insert a row in `stock_movements`. Per `CLAUDE.md`: "the ledger is the source of truth".

```bash
grep -rEn '\.branch_stock\.(update|upsert)' apps/api/src 2>/dev/null
```

Inspect each hit: is there a corresponding `stock_movements.create(` in the same transaction?

### 7. Audit log routing

State-changing actions must emit an audit entry to the **correct** log:
- Tenant actions → `audit_log` (per-tenant)
- Super-admin actions → `platform_audit_log`
- Impersonation → BOTH

```bash
grep -rEn '(audit_log|platform_audit_log)' apps/api/src 2>/dev/null
```

Ensure tenant code never writes directly to `platform_audit_log` and vice versa.

## Output

Emit a punch list with `file:line` and a one-line description. Group by severity:

- **Critical** — cross-realm client misuse, missing RLS on new table, money as float
- **High** — raw Prisma in tenant code, missing auth guard on controller, stock write without movement
- **Medium** — audit log routing, missing standard columns

Zero violations → return a single line: `RLS check passed.` Don't pad.

## When unsure

Some Prisma calls are legitimate (seed scripts, migrations, raw `$transaction` with explicit tenant filters). When unsure, flag and explain — don't auto-pass.
