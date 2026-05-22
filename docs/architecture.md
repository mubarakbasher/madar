# architecture.md — System Architecture

The system design for the SaaS POS platform. This document explains the high-level architecture, key technology choices, data flow, and operational concerns.

> **Companion documents:** `PRD.md` (product), `CLAUDE.md` (build conventions), `admin-app.md` (super-admin specifics), `billing-flow.md` (payment specifics).

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│    Browsers / Tablets / Mobile devices                              │
│                                                                     │
│   ┌──────────────────────────┐    ┌─────────────────────────────┐  │
│   │   Tenant Web App (PWA)   │    │   Super-Admin Web App       │  │
│   │   app.yourpos.com        │    │   admin.yourpos.com         │  │
│   │   Next.js 14 + React     │    │   Next.js 14 + React        │  │
│   │   EN + AR with RTL       │    │   EN only                   │  │
│   │   Offline POS support    │    │   MFA required              │  │
│   └────────────┬─────────────┘    └─────────────┬───────────────┘  │
│                │                                  │                 │
└────────────────┼──────────────────────────────────┼─────────────────┘
                 │                                  │
                 │  HTTPS (TLS 1.3)                 │
                 ▼                                  ▼
        ┌────────────────────────────────────────────────────┐
        │                                                    │
        │        API — NestJS Modular Monolith               │
        │        api.yourpos.com                             │
        │                                                    │
        │   ┌──────────────────┐  ┌──────────────────┐      │
        │   │ Tenant routes    │  │ Admin routes     │      │
        │   │ /v1/...          │  │ /admin/v1/...    │      │
        │   │ TenantAuthGuard  │  │ AdminAuthGuard   │      │
        │   └──────────────────┘  └──────────────────┘      │
        │                                                    │
        │   ┌──────────────────────────────────────┐         │
        │   │   Shared modules                     │         │
        │   │   - payment-proof                    │         │
        │   │   - i18n                             │         │
        │   │   - audit log                        │         │
        │   │   - file upload (S3 + ClamAV)        │         │
        │   └──────────────────────────────────────┘         │
        │                                                    │
        └────────────┬────────────────────────────────┬──────┘
                     │                                │
        ┌────────────┴──────────┐         ┌───────────┴────────┐
        │                       │         │                    │
        ▼                       ▼         ▼                    ▼
   ┌─────────────┐    ┌─────────────┐  ┌────────────┐   ┌────────────┐
   │ PostgreSQL  │    │ Redis       │  │ S3-compat  │   │ ClamAV     │
   │ 16 with     │    │ Cache +     │  │ Storage    │   │ Virus scan │
   │ RLS         │    │ BullMQ      │  │ (receipts) │   │            │
   └─────────────┘    └─────────────┘  └────────────┘   └────────────┘
```

---

## 2. Architectural Style

### 2.1 Modular monolith

We deliberately chose a **modular monolith** over microservices for v1.

**Why:**
- **SMB-scale velocity matters more than service granularity.** A small team ships faster with one deployable.
- **Tenant isolation is at the database (RLS), not the service.** Splitting into microservices wouldn't add isolation benefit.
- **Transactions span modules.** A sale touches inventory, customer, audit log, payment-proof — all in one transaction. Microservices would require sagas, which add latency and complexity.

**How:**
- One NestJS app, organized by domain module: `SalesModule`, `InventoryModule`, `BranchModule`, `SupplierModule`, `ReportModule`, `BillingModule`, `AdminModule`, plus shared modules.
- Each module is internally cohesive; cross-module calls go through public service interfaces, not direct DB access.
- Modules are eventually extractable. If `ReportModule` becomes a bottleneck, we can extract it to a separate service with a defined contract.

### 2.2 Two frontends, one backend

```
apps/web    →  /v1/...          (tenant API)
apps/admin  →  /admin/v1/...    (super-admin API)
```

Both call the same NestJS app at the same hostname (or behind the same load balancer). Routes are namespaced; auth guards select the realm.

This avoids duplicating business logic across two backends.

---

## 3. Frontend Architecture

### 3.1 Tenant app (`apps/web`)

- **Next.js 14 App Router** with Server Components default; `'use client'` only when needed.
- **PWA** — installable on tablets, offline-capable for POS sell screen.
- **Internationalization** via `next-intl`: locale-segmented routes `app/[locale]/...` with `en` and `ar`.
- **State:**
  - Server state: TanStack Query (with optimistic updates, cache invalidation).
  - Client state: Zustand (sparingly — UI state only, not data).
- **Forms:** react-hook-form + zod resolver.
- **Styling:** Tailwind CSS + shadcn/ui (heavily restyled per design tokens).
- **Service Worker:** caches static assets, product images, and recent sales for offline. Uses IndexedDB for transaction queue.

### 3.2 Admin app (`apps/admin`)

- Same Next.js + React stack.
- **No PWA** (internal tool, doesn't need offline).
- **No i18n** in v1 (English only; structure preserved for future Arabic).
- Uses the same design system via `packages/ui`.
- HTML class `theme-admin` remaps accent color to slate teal.

### 3.3 Shared frontend code

```
packages/ui/         Design tokens, base components, fonts
packages/shared/     TS types, zod schemas, currency/date utils
```

Both apps import from these. Components in `packages/ui` are framework-agnostic React, depend only on Tailwind and Radix primitives.

---

## 4. Backend Architecture

### 4.1 NestJS structure

```
apps/api/src/
├── main.ts
├── app.module.ts
├── tenant/                  Tenant-realm controllers
│   ├── sales/
│   ├── inventory/
│   ├── branches/
│   ├── suppliers/
│   ├── reports/
│   └── billing/
├── admin/                   Admin-realm controllers
│   ├── tenants/
│   ├── verification/
│   ├── banking/
│   ├── team/
│   └── audit/
├── shared/                  Cross-cutting services
│   ├── auth/
│   ├── payment-proof/
│   ├── i18n/
│   ├── storage/
│   ├── audit-log/
│   ├── notifications/
│   └── file-scanning/
└── infra/                   Bootstrapping
    ├── database/
    ├── queue/
    └── observability/
```

### 4.2 Module boundaries

A module exposes:
- **Controllers:** HTTP layer, thin, only validation + delegation.
- **Services:** business logic, transactional boundaries.
- **DTOs:** input/output shapes, validated with zod.
- **Events:** domain events emitted to the in-process event bus (for audit log, notifications).

Cross-module calls go through services, never direct DB access into another module's tables.

### 4.3 Auth guards

Two guards, mutually exclusive:

- **`TenantAuthGuard`** — validates tenant JWT, attaches `req.tenant` and `req.user` (tenant user), sets the PostgreSQL session `app.current_tenant_id`.
- **`AdminAuthGuard`** — validates admin JWT, attaches `req.platformUser`, sets `app.is_super_admin = true`. Optionally validates IP allowlist.

A route uses exactly one guard. Mixing is a lint error.

### 4.4 Idempotency

All write endpoints accept an `Idempotency-Key` header. Used by:
- POS sale submission (prevents double-charge on network retry).
- Payment proof upload.
- Stock transfer.

Stored in Redis for 24 hours. Repeat with same key + same body = same response.

---

## 5. Database Architecture

### 5.1 PostgreSQL 16 with Row-Level Security

**Why Postgres:**
- ACID transactions across business workflows.
- Mature, well-understood.
- Built-in row-level security is the cleanest way to enforce multi-tenancy.
- JSONB for translatable strings and flexible attributes.
- Full-text search supports Arabic out of the box.

**Why RLS:**
- Even if application code has a bug, the database refuses to leak rows across tenants.
- Defense in depth: a SQL injection vulnerability in app code cannot extract another tenant's data because the database session has no view into it.

### 5.2 Schema strategy

- **Shared database, shared schema** for all tenants.
- Every tenant-scoped table has a `tenant_id` column.
- RLS policy on every table: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`.
- Admin queries bypass RLS by setting `app.is_super_admin = true`.

### 5.3 Two Prisma clients

```typescript
// packages/db/tenant.ts
export const tenantPrismaFactory = (tenantId: string) => {
  return new PrismaClient().$extends({
    query: {
      async $allOperations({ args, query, operation }) {
        // Set session variable before each query
        await prismaRaw.$executeRaw`SET LOCAL app.current_tenant_id = ${tenantId}`;
        return query(args);
      }
    }
  });
};

// packages/db/admin.ts
export const adminPrisma = new PrismaClient().$extends({
  query: {
    async $allOperations({ args, query }) {
      await prismaRaw.$executeRaw`SET LOCAL app.is_super_admin = true`;
      return query(args);
    }
  }
});
```

Lint rule prevents importing the wrong client in the wrong app.

### 5.4 Migrations

- **Tool:** Prisma Migrate.
- **Rule:** migrations are immutable once merged to `main`. Need a fix? New migration.
- **Production:** migrations run in CI before deploy, with explicit approval gate.

### 5.5 Backups

- Hourly snapshots, 30-day point-in-time recovery.
- Weekly full backups, retained 1 year.
- Quarterly restore drills.

### 5.6 Multi-region (Phase 2+)

- Read replicas in EU and MENA regions for reporting and read-heavy operations.
- Writes still flow to the primary region.
- For tenants requiring data residency: dedicated database in their region, configured at the connection string level per tenant.

---

## 6. Storage

### 6.1 S3-compatible object storage

- **Production:** AWS S3 or DigitalOcean Spaces.
- **Local:** MinIO via Docker Compose.
- **What's stored:**
  - Product images.
  - Receipt images (payment proofs).
  - Tenant logos and branding assets.
  - Generated PDFs (receipts, invoices, reports).
  - Bulk export files.

### 6.2 Path conventions

```
products/{tenant_id}/{product_id}/{variant_id}/{image_id}.{ext}
tenants/{tenant_id}/payment-proofs/{proof_id}.{ext}
tenants/{tenant_id}/branding/logo.{ext}
generated/{tenant_id}/receipts/{sale_id}.pdf
exports/{tenant_id}/{export_id}.{ext}
```

### 6.3 Access

- All access via signed URLs with 24-hour expiry (configurable).
- No bucket is publicly readable.
- Server-side encryption (AES-256) at rest.

### 6.4 File upload pipeline

```
Client uploads
    │
    ▼
API receives multipart
    │
    ▼
Validate MIME, size
    │
    ▼
Stream to ClamAV daemon
    │
    ▼
On clean: re-encode (resize, strip EXIF)
    │
    ▼
Upload to S3
    │
    ▼
Return signed URL + DB record
```

---

## 7. Background Jobs

### 7.1 Queue infrastructure

- **Redis + BullMQ** for job queueing.
- Worker processes run in a separate container from the API (can scale independently).

### 7.2 Job types

**Hourly:**
- Generate daily/weekly/monthly scheduled reports.
- Recompute supplier scorecards.

**Daily:**
- Calculate suggested reorder points (rolling 30-day × lead time).
- Send trial-ending reminders (3 days, 1 day).
- Send subscription verification daily digest to super-admins.
- Generate next-cycle invoices for renewals.
- Clean up expired signed URLs.

**On-demand:**
- File scanning + processing.
- PDF generation (receipts, invoices, reports).
- Bulk import of products.
- Bulk export of data.
- Email sending.
- Webhook delivery (Phase 4).

### 7.3 Reliability

- Each job has a max retry count and exponential backoff.
- Failed jobs go to a dead-letter queue, visible in super-admin app at `/system/jobs`.
- Idempotent job design — same payload twice = same outcome.

---

## 8. Real-Time Features

### 8.1 socket.io

Used for:
- Live multi-terminal POS sync (one cashier's sale updates the manager's dashboard).
- Owner dashboard live KPI updates.
- Verification queue updates (new proofs appear without refresh).

### 8.2 Rooms

- One room per tenant: `tenant:{tenant_id}` — all users of a tenant connect to it.
- One room per branch: `branch:{branch_id}` — for branch-scoped events.
- One room for super-admins: `platform:admins`.

### 8.3 Event examples

- `sale.created` → broadcast to `branch:{id}` and `tenant:{id}`.
- `stock.low` → broadcast to `branch:{id}` for managers.
- `payment_proof.submitted` → broadcast to `platform:admins` (for subscription proofs).

---

## 9. Caching

### 9.1 Redis usage

- **Session store** for both auth realms.
- **Rate limiting** (per tenant, per endpoint).
- **Idempotency keys** (24-hour TTL).
- **Hot data cache:** product catalog snapshots (per branch, 5-minute TTL), exchange rates (1-hour TTL), feature flags (1-minute TTL).
- **BullMQ backing.**

### 9.2 Cache invalidation

- Product cache invalidated on any product mutation.
- Branch stock cache invalidated on every stock movement (sub-second consistency is required).
- Feature flag cache: TTL only; eventual consistency acceptable.

---

## 10. Offline POS

The most complex client-side feature. See `CLAUDE.md` "Offline POS Sync" for the full rules.

### 10.1 Architecture

```
PWA loaded → Service Worker installs → IndexedDB created
                              │
                              ▼
                  Static assets cached
                  Product catalog cached (per branch)
                  Tax rules cached
                              │
                              ▼
                  Online: API calls work normally
                  Offline: detected via fetch() failure or navigator.onLine
                              │
                              ▼
                  Sales captured to IndexedDB queue
                  Receipt images queued
                              │
                              ▼
                  Reconnect detected → background sync starts
                              │
                              ▼
                  Each queued item POSTed with idempotency key
                  Conflicts logged to sync_conflicts table
```

### 10.2 Conflict resolution

- **Idempotency:** if a sale's UUID already exists server-side, return the existing sale silently (avoids duplicate submission).
- **Negative stock:** if applying an offline sale would result in negative stock, the sale still completes but is flagged for manager review (`sync_conflicts` row).
- **Stock movements always serialize on the server.** No race conditions because every movement is an INSERT, never an UPDATE to running totals (totals are denormalized cache).

---

## 11. Internationalization

### 11.1 Frontend

- **next-intl** library.
- Translation files: `apps/web/messages/en.json` and `ar.json`.
- Locale detected from URL segment.
- Lint rule: no string literals in JSX outside translation calls.

### 11.2 Backend

- **nestjs-i18n** for error messages.
- Locale from `Accept-Language` header or authenticated user's `locale` field.

### 11.3 Database

- Translatable strings stored as `jsonb`: `{ "en": "Coca-Cola", "ar": "كوكاكولا" }`.
- Query helper: `getLocalized(name, locale)` extracts the right value.
- Full-text search uses two indexes — one per language config.

---

## 12. Observability

### 12.1 Metrics (OpenTelemetry)

- **Service-level:** request count, latency P50/P95/P99, error rate per endpoint.
- **Business-level:** sales per second, verification queue depth, active sessions per tenant.
- **Infrastructure:** DB connections, Redis memory, S3 storage, queue lag.

Exported to Prometheus or Datadog.

### 12.2 Logs

- Structured JSON to stdout.
- Correlation ID per request, propagated through services.
- **Sensitive fields redacted:** passwords, full account numbers, card data (n/a — we don't process), MFA secrets.

### 12.3 Errors (Sentry)

- Two separate Sentry projects: `tenant-app` and `admin-app`.
- Tenant context attached to every error (anonymized in cross-project views).
- Source maps uploaded on deploy.

### 12.4 Health endpoints

- `/health/live` — basic process check.
- `/health/ready` — checks DB, Redis, S3 reachability.
- `/health/deep` (admin app only) — comprehensive system check.

---

## 13. Security

### 13.1 Transport and storage

- **TLS 1.3** for all traffic.
- **AES-256** encryption at rest for database and object storage.
- HSTS, secure cookies, CSP headers.

### 13.2 Authentication

- **Argon2id** for password hashing (or scrypt as fallback).
- **JWTs** for session tokens, short-lived (8h tenant, 8h admin).
- **Refresh tokens** stored in HTTP-only cookies.
- **MFA via TOTP** for admin (mandatory) and tenant Owner (optional, encouraged).

### 13.3 Authorization

- RBAC at the application layer (services check role + branch scope).
- RLS at the database layer (defense in depth).

### 13.4 Input validation

- Every external input passes through zod or class-validator.
- No dynamic SQL — all queries parameterized via Prisma.

### 13.5 File uploads

- ClamAV scan on every upload.
- EXIF strip on images (privacy — geolocation).
- Re-encoding (defeats some embedded payloads).

### 13.6 Rate limiting

- Per IP for unauthenticated routes (signup, login).
- Per tenant for authenticated routes.
- Per platform user for admin routes.

### 13.7 Audit

- Tenant `audit_log` (per-tenant, append-only).
- `platform_audit_log` (super-admin actions, append-only).
- Database triggers prevent UPDATE / DELETE on both tables.

---

## 14. Deployment

### 14.1 Local development

- `docker compose up` brings up Postgres, Redis, MinIO, ClamAV.
- Apps run via `pnpm dev`.
- Same code paths as production (no separate "dev" implementations).

### 14.2 CI/CD

- **GitHub Actions** pipeline:
  1. Install + cache deps.
  2. Lint + typecheck.
  3. Unit tests.
  4. Integration tests (real Postgres in Docker).
  5. RLS isolation tests.
  6. E2E tests (Playwright, EN + AR).
  7. Visual regression.
  8. Build all apps.
  9. Push images to registry.
  10. Deploy to staging.
  11. Manual approval gate.
  12. Deploy to production.

### 14.3 Infrastructure (production)

- **AWS ECS** (or equivalent) for container orchestration.
- **RDS Postgres** for primary DB.
- **ElastiCache Redis**.
- **S3** for object storage.
- **CloudFront** in front of both apps.
- **Route 53** for DNS.
- **Terraform** for IaC.

### 14.4 Blue-green deploys

- New version deploys alongside old.
- Load balancer flips after health checks pass.
- Old version retained for fast rollback (15-minute window).

---

## 15. Scalability Plan

### 15.1 Vertical first, horizontal second

For an SMB-target product:
- **Year 1:** single region, vertical scaling on RDS and ECS as needed.
- **Year 2:** read replicas for reporting workloads.
- **Year 3:** regional sharding (EU, MENA, US) for data residency.

### 15.2 Bottleneck order (expected)

1. **Reporting queries** at high tenant counts — solved by read replicas.
2. **POS write throughput** at peak — solved by connection pooling and partitioning `sales` / `stock_movements` by month.
3. **File storage** for receipts — S3 scales effectively infinitely; only cost is the concern.
4. **WebSocket connections** — solved by horizontal scaling of socket.io with Redis adapter.

### 15.3 What we won't worry about

- "Web-scale" anything in v1. SMB POS will not hit Twitter-scale problems.
- Premature event sourcing. The audit log gives us the auditability without the complexity.

---

## 16. Decisions Log Summary

Major architectural decisions (see `docs/decisions/` for full ADRs):

| # | Decision | Status |
|---|---|---|
| 0001 | Modular monolith over microservices | Adopted |
| 0002 | Bank transfer with manual verification over payment gateway | Adopted |
| 0003 | PostgreSQL RLS for multi-tenancy | Adopted |
| 0004 | Two separate frontend apps (tenant + admin) | Adopted |
| 0005 | English + Arabic as equal first-class languages | Adopted |
| 0006 | shadcn/ui as base, heavily restyled to Claude-inspired tokens | Adopted |
| 0007 | No AI / LLM features in v1 — rule-based only | Adopted |
| 0008 | Offline-first POS with IndexedDB queue | Adopted |
| 0009 | Inventory commits on sale regardless of payment verification status | Adopted |
| 0010 | Two Prisma clients with lint-enforced separation | Adopted |

---

## 17. Reference

- `PRD.md` — product scope
- `CLAUDE.md` — build conventions
- `PAGES.md` — UI specs
- `design-system.md` — visual reference
- `billing-flow.md` — payment specifics
- `admin-app.md` — super-admin app
- `i18n-guide.md` — internationalization workflow
- `docs/decisions/` — architecture decision records (ADRs)
