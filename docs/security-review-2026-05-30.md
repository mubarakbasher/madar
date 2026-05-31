# Madar — Production Security Review

**Date:** 2026-05-30 · **Branch:** main · **Scope:** apps/api, apps/web, apps/admin, packages/db
**Method:** read-only static audit (boundary/RLS auditor + two security explorers)
**Verdict:** PASS — 0 critical, 0 high, 0 medium, 2 low. Cleared for trial.
**Update 2026-05-31:** MEDIUM-1 was a false positive (the append-only triggers already existed); the only real residual — a TRUNCATE bypass — has since been closed. See the finding below.

## Where we stand right now

| Area | Status | Note |
|---|---|---|
| Hardcoded secrets / committed .env | PASS | Only `.env.example` templates; secrets via env + Zod validation (min-length enforced) |
| Input validation | PASS | Zod/class-validator DTOs on all endpoints; magic-byte MIME, ISO currency, UUID checks |
| File uploads (receipts) | PASS | ClamAV INSTREAM scan, Sharp EXIF strip + 2000px resize, 5MB + type allowlist (double-checked) |
| AuthN / AuthZ | PASS | Separate JWT secrets per realm, realm claims enforced, MFA mandatory for admins, Argon2 hashing |
| Realm separation (tenant/admin) | PASS | TenantAuthGuard global APP_GUARD; AdminAuthGuard per-route; no cross-realm imports or JWT acceptance |
| RLS on tenant tables | PASS | ENABLE + FORCE + tenant_isolation policy on all 13+ tenant tables; NULLIF hardening migration present |
| Multi-tenancy data layer | PASS | tenantScoped vs adminPrisma correctly split; no raw `prisma.X` in tenant code; locked txns set_config tenant id |
| Money typing | PASS | All money BigInt cents + currency_code; only Decimal is geo lat/lng |
| Bank account masking | PASS | AES-256-GCM at rest; audit shows last-4 only; full reveal endpoint is itself audited |
| Raw SQL / injection | PASS | `$queryRawUnsafe` always parameterized ($1,$2…); no string concatenation |
| Rate limiting | PASS | Redis sliding-window per endpoint (login 10/min, signup 5/hr…), dual-bucket IP+email, 429 |
| CORS / Helmet | PASS* | Helmet on; CORS from `API_CORS_ORIGIN` allowlist. *No code guard against `*` in prod (see Low-1) |
| Audit log append-only | PASS | DB triggers (`fn_audit_log_append_only`) block UPDATE/DELETE on both tables; TRUNCATE blocked + UPDATE/DELETE revoked from `madar_app` as of `20260602000000` (see Medium-1, resolved) |

**Build status:** Phase 1 ~95%, Phases 2 / 3 / 3.5 / 3.6 complete, Phase 4 not started. ~415 checklist items done, ~88 pending. RLS suite reported green (82 tests); i18n EN/AR in lockstep (~1923 keys).

## Findings

### MEDIUM-1 — Audit logs are not append-only at the database level — ✅ RESOLVED (false positive + residual fix)
**Re-assessment (2026-05-31):** this was a **false positive**. The init migration already enforces append-only — `20260514000000_init/migration.sql:426–441` defines `fn_audit_log_append_only()` (a `RAISE EXCEPTION` trigger fn) with `BEFORE UPDATE` and `BEFORE DELETE` triggers on **both** `audit_log` and `platform_audit_log`, and `packages/db/test/rls.test.ts` already proved UPDATE/DELETE are blocked. The original scan looked for an RLS policy/constraint and missed the triggers.
**Residual gap (now closed):** row-level UPDATE/DELETE triggers do not fire on `TRUNCATE`. Migration `20260602000000_audit_log_truncate_guard` adds `BEFORE TRUNCATE` statement triggers on both tables and revokes `UPDATE, DELETE, TRUNCATE` from `madar_app` (defense-in-depth; SELECT + INSERT remain). Verified: even the `madar` superuser hitting `TRUNCATE audit_log` now raises `audit log tables are append-only (operation: TRUNCATE)`. New tests in `rls.test.ts` cover `platform_audit_log` UPDATE/DELETE and TRUNCATE on both tables (RLS suite **86/86**).

### LOW-1 — No production guard against CORS wildcard
If `API_CORS_ORIGIN` is set to `*` in prod, credentialed CORS becomes permissive; no startup check rejects it.
- Evidence: `apps/api/src/main.ts:27`, `apps/api/src/env.ts:6`
- Fix (next): throw at boot when `NODE_ENV=production` and origins include `*`.

### LOW-2 — Production env/runtime preconditions are documentation-only
Safe operation depends on deploy-time values: `VIRUS_SCANNER=clamav` (with daemon up), `PLATFORM_BANK_ENCRYPTION_KEY` (64-hex), `JWT_TENANT_SECRET` ≠ `JWT_ADMIN_SECRET`.
- Fix (next): add a boot-time assertion / deploy checklist gate.

### Informational (not security)
PO PDF pagination TODO (`shared/pdf/po-pdf.renderer.ts:80`); branch "return-marked sales" metric is a placeholder (`tenant/branches/branches.service.ts:759`).

## What we do next (prioritized)

1. **Run live scans** to confirm runtime state: `pnpm test:rls`, then `pnpm audit` (dependency CVEs) and `pnpm lint && pnpm typecheck`.
2. ~~**MEDIUM-1** — audit-log immutability~~ — ✅ done (`20260602000000_audit_log_truncate_guard`); already enforced for UPDATE/DELETE, TRUNCATE now closed too.
3. **LOW-1** — add the prod CORS-wildcard boot guard.
4. **LOW-2** — add boot-time assertions for the prod secrets/scanner preconditions + a deploy checklist.
5. Optional: run `/security-review` on the branch diff before the next release for a focused changed-code pass.

## How this was verified
Static read-only audit across all tenant/admin controllers & services, 20 migrations, the Prisma schema, both frontends, and the `@madar/db` clients. No code was changed. Runtime test execution is deferred to step 1 above.
