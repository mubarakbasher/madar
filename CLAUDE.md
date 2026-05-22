# CLAUDE.md

Guidance for Claude Code in this repo. **This file is the contract for *how*.** The *what* and *why* live in `docs/` — see [Reference](#reference) at the bottom. When this file and a doc disagree on a rule, this file wins.

---

## Project Overview

Multi-tenant SaaS POS for SMB retailers, wholesalers, restaurants, and pharmacies. Each tenant runs multiple branches with isolated data, real-time inventory, supplier management, and income analysis.

- **Bilingual day-one:** English + Arabic, full RTL, Arabic-Indic numerals option, Hijri toggle.
- **Design language:** Claude-inspired — warm, editorial, calm. Not another cold SaaS dashboard.
- **Payments:** Bank transfer + uploaded receipt + manual verification. **No payment gateway.**
- **Two apps, one backend:** tenant app (`apps/web`) and super-admin app (`apps/admin`). Shared API, separate auth realms, separate deploys.

Build phase by phase per `tasks.md`. Each numbered item ends with tests + commit + review pause.

**Always update `tasks.md` as part of any task.** When you complete, partially complete, or defer work that maps to a checklist item in `tasks.md`, edit `tasks.md` in the same change: tick the box (`[x]`), add a one-line note for partial completion or deferral, or add the item if it was missing. Never leave `tasks.md` stale after touching code — the file is the project's source of truth for "what's actually done." Update before reporting the task complete, not after.

---

## Tech Stack (Locked In)

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend (both apps) | Next.js 14 App Router + TS + Tailwind + shadcn/ui (restyled) |
| State | TanStack Query + Zustand |
| Backend API | NestJS + TS (one API, two auth realms) |
| Database | PostgreSQL 16 with RLS |
| ORM | Prisma (two clients: `tenantScoped`, `adminPrisma`) |
| Cache/Queue | Redis + BullMQ |
| Search | PostgreSQL FTS (Arabic config) |
| Storage / Scan | S3-compatible (MinIO locally) / ClamAV |
| Realtime | socket.io |
| i18n | next-intl (FE) + nestjs-i18n (BE) |
| Fonts | Fraunces, Geist, IBM Plex Sans Arabic |
| Icons / Charts / Motion | Lucide React / Recharts (restyled) / Motion |
| Email | Resend or SMTP |
| Infra | Docker Compose local; AWS ECS + Terraform prod |
| Observability | Sentry (separate projects per app) + OpenTelemetry |

**Forbidden:** any payment gateway (Stripe, Paymob, Tap, PayTabs, etc.).

---

## Repository Structure

```
apps/
  web/         # Tenant app (Next.js, PWA, EN+AR)
  admin/       # Super-admin app (Next.js, EN-only)
  api/         # NestJS — src/tenant, src/admin, src/shared
packages/
  db/          # Prisma schema, migrations, seed
  shared/      # Types, zod schemas, constants
  ui/          # Design system (tokens.css, fonts.ts, components) — shared
  config/      # ESLint, TS, Tailwind shared
infra/         # docker/, terraform/
docs/          # PRD, PAGES, design-system, architecture, admin-app, billing-flow, i18n, ADRs, design bundle
.claude/       # settings, hooks, project skills (madar-*), project agents
tasks.md       # build roadmap
```

---

## Commands

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis minio clamav
pnpm db:migrate && pnpm db:seed

pnpm dev          # all
pnpm dev:web      # tenant :3000
pnpm dev:admin    # admin  :3001
pnpm dev:api      # api    :4000

pnpm db:migrate | db:reset | db:studio | db:seed
pnpm test         # unit
pnpm test:e2e     # tenant (en+ar)
pnpm test:e2e:admin
pnpm test:rls     # CRITICAL — multi-tenant isolation
pnpm test:rtl | test:visual
pnpm i18n:check | i18n:extract
pnpm lint | typecheck | format
```

Seed creates demo tenant `owner@acme.test / Demo123!` and super-admin `admin@platform.test / Admin123!` (MFA QR in seed log).

---

## Multi-Tenancy — Non-Negotiable

A cross-tenant data leak is an extinction-level event. Read this section before any data-layer or API work.

1. Every table except platform tables (`tenants`, `platform_users`, `platform_audit_log`, `platform_bank_accounts`, `plans`, `feature_flags`) has `tenant_id`.
2. **Tenant app:** every query goes through `tenantScoped(req)`. Lint enforces. Middleware sets `app.current_tenant_id` per request.
3. **Admin app:** cross-tenant queries go through `adminPrisma` only, which sets `app.is_super_admin = true` and bypasses RLS. The tenant Prisma client **never** sets this flag.
4. PostgreSQL RLS enabled on every tenant-scoped table.
5. `pnpm test:rls` must pass before any merge.
6. Never use raw `prisma.X.findMany()`.

```ts
// ❌ FORBIDDEN
const p = await prisma.product.findMany();

// ✅ Tenant app
const p = await tenantScoped(req).product.findMany();

// ✅ Admin app (cross-tenant, explicit)
const p = await adminPrisma.product.findMany({ where: { tenant_id: targetId } });
```

**Two auth guards:** `TenantAuthGuard` for `src/tenant/*`, `AdminAuthGuard` for `src/admin/*`. Cross-realm calls forbidden — admin endpoints never read tenant JWTs and vice versa.

**Two audit logs:** `audit_log` (per tenant) and `platform_audit_log` (super-admin actions). Both append-only — no updates, no deletes, ever.

### Login-as Impersonation

1. Log to `platform_audit_log` with reason, target tenant + user, IP, UA.
2. Mint short-lived (≤1h) impersonation JWT scoped to that tenant, carrying `impersonator_id`.
3. Tenant UI shows a danger-colored banner: "Viewing as [Tenant] — Logged in as [Admin] · [Exit]".
4. Every action during impersonation is double-logged (both tables).
5. Bulk product deletes, customer deletes, mass refunds are **blocked during impersonation** even if normally permitted.
6. Single-tenant per session; exit and re-impersonate to switch.

---

## Super-Admin App — Rules

Full spec in `docs/admin-app.md`. Page list in `docs/PAGES.md`. Page-build order in `tasks.md`.

1. Lives at `apps/admin/`, own `package.json`, deploys to `admin.yourpos.com`.
2. Separate auth: `/admin/login`, separate JWT secret, separate session table. **MFA mandatory.**
3. Optional IP allowlist for production.
4. `adminPrisma` is the only way to make cross-tenant queries. Never used in tenant app.
5. Every super-admin action → `platform_audit_log`. Impersonation also writes to tenant `audit_log`.
6. Super-admins can edit tenant *configuration* (status, plan, suspension). Editing tenant *business data* (sales, inventory, customers) requires typed reason and is flagged.
7. Same `packages/ui` design system. Visual difference: `<html class="theme-admin">` swaps accent to slate teal; "Admin Panel" badge in header.
8. English only for now.

**Roles:** Platform Owner | Finance/Verifier | Support | Developer | Read-only. Matrix enforced at API (403) and UI (hide).

---

## Payments — Bank Transfer Model

Full spec in `docs/billing-flow.md`. **No payment gateway, ever.**

### Shared module `payment-proof`

One reusable module powers both flows. Table `payment_proofs` with `context ∈ {subscription, sale}` and `reference_id` pointing at either `subscription_invoice` or `sale`. Verifier UI differs by context:

- `context='subscription'` → verified in **admin app** by Finance/Verifier role.
- `context='sale'` → verified in **tenant app** by branch supervisor/manager.

States: `pending → verified` or `pending → rejected → pending` (resubmit) or `pending → cancelled`. Verifier + timestamp + notes immutable once recorded. Reverting requires manager override and a **new** audit entry — never edits the original.

### Subscription flow

Trial (14d, no payment info) → invoice with our bank details + reference code → tenant transfers + uploads receipt → admin verifies → `active`. Reject → 7-day grace from original due date before suspension.

States: `active → grace_period → suspended (30d read-only) → cancelled (90d export then archive)`.

### POS bank-transfer flow

Cashier selects "Bank Transfer" → POS shows QR with tenant's receiving account + total → cashier uploads receipt → sale = `payment_pending`. **Inventory commits regardless of payment verification** (goods left the shop). Supervisor verifies later → `paid` or `disputed`.

### POS payment methods (strategy pattern)

Cash | Bank transfer | Manual card (cashier enters terminal approval code) | Store credit | Split tender.

### Receipts

Max 5 MB; JPG/PNG/PDF; resize to 2000px long edge; strip EXIF; ClamAV scan; stored at `tenants/{tenant_id}/payment-proofs/{proof_id}.{ext}`; signed URLs only; 7-year retention.

### Bank accounts

- **Tenant receiving accounts:** tenant-scoped, translatable `{ en, ar }`, default + per-branch overrides.
- **Platform receiving accounts:** global, super-admin only, surfaced to tenants by currency + country.
- Never log full account numbers — mask to last 4.

---

## Design System — Claude-Inspired

Full spec in `docs/design-system.md`. Canonical token values in `packages/ui/tokens.css` (and `docs/design/project/design-tokens.css` for the prototype source).

### Principles
1. Calm over busy — whitespace is a feature.
2. Warm, not cold — off-white bg, earthy accents.
3. Editorial typography — magazine-like hierarchy.
4. Soft confidence — rounded corners, gentle shadows.
5. Content first — chrome recedes.
6. Honest motion — subtle, purposeful.

### Non-negotiable
- **Never hardcode** colors, sizes, shadows, radii. Always design tokens.
- Tenant accent `--color-accent` (warm coral `#C96442`). Admin accent `--color-admin-accent` (slate teal `#4A6B7A`). Admin app swap is one CSS class — `<html class="theme-admin">` — no component changes.
- Fonts: display `Fraunces`, body `Geist`. Arabic body `IBM Plex Sans Arabic`, display `IBM Plex Serif Arabic`. Loaded via `packages/ui/fonts.ts`.
- Lucide React only, stroke 1.5, never mixed with filled icons.
- Charts: single-color primary, muted comparison, no 3D, dashed gridlines.
- POS sell screen: 56 px+ tap targets, total in display serif 56–72 px, pay button 64 px tall full-width.
- Dark mode from day one. All tokens have dark variants.
- Every empty list: quiet illustration / oversized icon + display-font headline + supporting sentence + one CTA.

### Anti-patterns (forbidden)
Glassmorphism · neon glows · saturated gradients · stacked card shadows faking 3D · 12+ widgets above the fold · emoji as UI affordance · bouncy/elastic animation · background video · default shadcn styling (always restyle to tokens).

### Admin-app visual deltas
Admin badge in header · slate-teal accent everywhere coral would go · impersonation banner (full-width, danger color) when active · "Platform" label in sidebar.

---

## i18n & RTL — Mandatory

Full spec in `docs/i18n-guide.md`. Canonical EN→AR terms in `docs/i18n-glossary.md` (binding — propose new terms there before ad-hoc translating).

1. i18n set up before any UI work.
2. **No hardcoded user-facing strings** in either app. Lint enforces.
3. Tenant app: locale-segmented routes `app/[locale]/...` (`en` | `ar`). `<html dir>` flips by locale.
4. Admin app: no locale segment, English only.
5. **Logical CSS only** in tenant app: `ms-/me-/ps-/pe-/text-start/text-end`. Never `ml-/mr-/pl-/pr-/text-left/text-right`. Admin app prefers logical too for portability.
6. Directional icons: `rtl:rotate-180`.
7. Translatable data columns: `jsonb` `{ en, ar }`. Applies to `products`, `categories`, `tax_classes`, `payment_methods`, `unit_of_measure`, `notification_templates`, `receipt_templates`, `bank_accounts`.
8. `Intl.NumberFormat` for currency. Western digits default; Arabic-Indic optional in tenant settings.
9. Gregorian default; Hijri toggle in tenant settings. Storage always ISO 8601 UTC.
10. PostgreSQL FTS uses both `english` and `arabic` configs; products indexed in both.
11. `pnpm i18n:check` validates parity — fails CI on key drift.
12. No machine translation without human review.

---

## Coding Conventions

### General
- TS strict, no `any`. Zod for all external input. No magic numbers/strings. Files <300 lines, functions <50 lines.

### Naming
`camelCase` vars/fns · `PascalCase` types/components · `SCREAMING_SNAKE_CASE` consts · `kebab-case.ts` files (except components) · `snake_case` plural for tables, singular for columns.

### Backend
- One module per domain. `TenantAuthGuard` for tenant routes, `AdminAuthGuard` for admin routes. Cross-realm calls forbidden.
- DTOs validated (zod or class-validator). Every mutation emits a domain event to the correct audit log. Idempotency keys on all resource-creating POSTs.

### Frontend
- Server Components by default; `'use client'` only when needed.
- Forms: `react-hook-form` + zod resolver. Data: TanStack Query.
- Tenant text via `useTranslations()`. Admin text from `en.json` directly.
- Visual properties via tokens only.

### Database
- Migrations immutable once merged.
- Tenant-scoped tables: `id` (uuid), `tenant_id` (uuid), `created_at`, `updated_at`, `created_by`, soft `deleted_at`.
- Platform tables: `tenants`, `platform_users`, `platform_audit_log`, `platform_bank_accounts`, `plans`, `feature_flags`.
- Money = integer cents in `bigint` + sibling `currency_code` (ISO 4217). **Never floats.** Currencies without minor unit (KWD: 3, JPY: 0) use `currency_minor_units` lookup. Multi-currency tenants store both branch and transaction currency + snapshot exchange rate.

---

## Critical Domain Logic

- **Inventory source of truth:** `stock_movements` ledger. `branch_stock.qty_on_hand` is a denormalized cache. Never mutate the cache without a movement row. Inventory commits on sale completion **regardless of payment verification**.
- **COGS:** snapshot current cost into `sale_lines.cogs_snapshot` at sale time. Profit reports use the snapshot.
- **Offline POS:** client UUID + monotonic sequence per txn; idempotency-validated server-side; negative-stock sales complete but flag for manager; conflicts → `sync_conflicts`. Offline bank-transfer receipts queue locally and sync when online.
- **Reorder:** per-branch `reorder_point` and `reorder_qty` set manually. Alert when `qty_on_hand <= reorder_point`. Optional daily job suggests reorder points from rolling 30-day avg × lead time (plain SQL).
- **Audit:** see Multi-Tenancy section. Both logs append-only. Impersonation double-logs.

---

## Security Checklist (every feature, before "done")

- [ ] `pnpm test:rls` passes
- [ ] Admin feature uses admin guard; no leakage to tenant routes (or vice versa)
- [ ] Input validated with zod
- [ ] Authorization checked (role + branch scope for tenants; super-admin role for admin)
- [ ] No sensitive data logged (bank account numbers masked to last 4)
- [ ] Rate-limited if public-facing
- [ ] Audit entry written to the correct log
- [ ] Uploaded files virus-scanned (ClamAV)
- [ ] No secrets in code; parameterized queries only
- [ ] Tenant app: tested EN (LTR) **and** AR (RTL)
- [ ] Tested in light **and** dark mode
- [ ] All user-facing strings in `en.json` (both apps) and `ar.json` (tenant)
- [ ] Uses design tokens — no hardcoded values

---

## Testing Strategy

- **Unit (Vitest):** 80%+ on services.
- **Integration:** real Postgres in Docker.
- **RLS:** mandatory — two tenants, every endpoint, isolation asserted. Also asserts admin endpoints reject tenant JWTs and vice versa.
- **E2E (Playwright):** tenant critical flows in EN + AR; admin verification + impersonation + lifecycle.
- **Visual regression:** every page LTR+RTL+light+dark (tenant); light+dark (admin).
- **Load (k6):** POS endpoints, 200 req/s per tenant sustained.

---

## Git & PR

### Branches
`main` always deployable. `feat/<scope>-<name>`, `fix/<scope>-<name>`, `chore/<scope>`.

### Commits
```
feat(billing): bank transfer receipt upload
feat(admin): verification queue MVP
feat(pos): bank transfer payment method
fix(payment-proof): handle large receipt images
i18n(reports): Arabic for P&L
chore(deps): bump prisma to 5.20
```

### PRs
One concern per PR. Description: what, why, how tested, screenshots in LTR+RTL+light+dark (tenant) or light+dark (admin). All checks green: lint, typecheck, unit, integration, RLS, e2e, i18n:check, visual.

---

## Decision-Making

When stuck:
1. Re-read the relevant doc (`docs/PRD.md`, `docs/PAGES.md`, `docs/billing-flow.md`, etc.).
2. Check existing patterns in the codebase.
3. Ask the user one focused question with 2–3 concrete options.
4. Document the decision in `docs/NNNN-<title>.md` (ADR — immutable once adopted; supersession is a new ADR).
5. Never silently invent a requirement.

When sources disagree: **PRD wins on *what*, this file wins on *how*, design prototype wins on *visual*, `docs/PAGES.md` wins on *behavior*.** Visual disagreements with stakeholders escalate — don't silently compromise the system.

---

## What NOT to Do

- ❌ Mix tenant and admin code paths in the same controller or route handler
- ❌ Use `adminPrisma` in the tenant app or `tenantScoped` in the admin app
- ❌ Add admin features under `apps/web/` — they live in `apps/admin/`
- ❌ Skip MFA for super-admins
- ❌ Allow impersonation without writing to both audit tables
- ❌ Integrate a payment gateway
- ❌ Skip RLS, i18n, or design-system setup
- ❌ Hardcode strings, colors, sizes, radii, shadows
- ❌ Use physical CSS (`ml-`, `pr-`, `text-left`). Logical only
- ❌ Store money as floats
- ❌ Mutate `branch_stock.qty_on_hand` without a `stock_movement` row
- ❌ Trust uploaded files — scan, validate, strip metadata
- ❌ Show full bank account numbers in logs — mask to last 4
- ❌ Auto-approve payment proofs — verification is always human
- ❌ Block inventory updates on payment verification — they are independent
- ❌ Commit `.env` or secrets
- ❌ Add deps without PR justification
- ❌ Ship UI without empty / loading / error states
- ❌ Use default shadcn styling — restyle to tokens
- ❌ Cram 12+ widgets above the fold

---

## Reference

`CLAUDE.md` is the *how*. The *what* and *why* live here.

**Product & scope**
- `docs/PRD.md` — personas, modules, roadmap, metrics. Read before any new module.
- `docs/PAGES.md` — page-by-page UI spec for both apps. Read before building/modifying any page.
- `tasks.md` (root) — Phase 1→4 build roadmap with status + design-bundle file map.

**Design**
- `docs/design-system.md` — tokens, components, typography, motion, a11y.
- `docs/design/README.md` — how to use the design bundle.
- `docs/design/chats/` — design transcripts (intent behind each screen).
- `docs/design/project/` — prototype source (canonical visual reference):
  - `design-tokens.css` — single source of truth for tokens
  - `i18n-ar.js` — Arabic seed for tenant app
  - `data.js` / `admin-data.js` — mock-data shapes (seed shape only)
  - `screen-*.jsx` (tenant), `admin-*.jsx` (admin), `*.html` shells
  - `components.jsx`, `icons.jsx` — primitives (port to Lucide + `packages/ui`)

**Architecture & ops**
- `docs/architecture.md` — system, modules, RLS, jobs, deploy.
- `docs/admin-app.md` — admin routes, auth, impersonation, page list. Read before any `apps/admin/` work.
- `docs/billing-flow.md` — bank-transfer specs for both subscription and POS-sale flows. Read before touching `payment_proofs`.
- `docs/openapi.yaml` — API spec stub.

**i18n**
- `docs/i18n-guide.md` — workflow, RTL implementation, tooling.
- `docs/i18n-glossary.md` — canonical EN→AR domain terms (binding).

**Decisions**
- `docs/0001-modular-monolith.md` (adopted)
- `docs/0002-bank-transfer-payments.md` (adopted)
- New ADRs: `docs/NNNN-<title>.md`, immutable.

**Index**
- `docs/README.md` — index of every doc in `docs/`.

**Internal tooling (`.claude/`)**
- `.claude/settings.json` — plugins + advisory hooks (warn, never block).
- `.claude/skills/madar-*/SKILL.md` — `madar-port-screen`, `madar-rls-check`, `madar-i18n-sync`, `madar-payment-proof`.
- `.claude/agents/madar-*.md` — `madar-design-porter` (write-enabled porter), `madar-boundary-auditor` (read-only RLS auditor).
- `.claude/hooks/` — `check-tokens.js` on Edit/Write, `design-reminder.js` on UserPromptSubmit.
