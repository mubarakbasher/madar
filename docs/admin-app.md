# admin-app.md — Super-Admin Platform App Specification

The platform operator's application. Lives at `apps/admin/`, deployed to `admin.yourpos.com`. Used by your staff (you) to run the SaaS.

> **Companion documents:** `PRD.md` (product scope), `CLAUDE.md` (build conventions), `PAGES.md` (page-by-page UI), `design-system.md` (visual reference), `billing-flow.md` (verification specifics).

---

## 1. Why a Separate App

A super-admin panel cannot be "a few special routes inside the tenant app." We split it into a fully separate application for five reasons:

1. **Different audience.** Your staff, not tenant customers.
2. **Different security posture.** Super-admins see across all tenants. One mistake here leaks everything. Smaller surface = smaller risk.
3. **Different deploy cadence.** Internal tools change more often, can ship without affecting customer traffic.
4. **Different auth scope.** A stolen tenant JWT cannot grant admin access — different secret, different realm.
5. **Different observability.** Admin actions go to a dedicated audit log and Sentry project.

---

## 2. Architecture

### 2.1 Domain and deployment

- **Production URL:** `admin.yourpos.com`
- **Staging:** `admin-staging.yourpos.com`
- **Local:** `http://localhost:3001`
- **CDN:** internal, not customer-facing.
- **IP allowlist:** optional, can restrict to office VPN in production.

### 2.2 Auth realm

- **Login at:** `/login`
- **JWT secret:** distinct from tenant app (`ADMIN_JWT_SECRET` env var).
- **MFA mandatory** for every super-admin. No exceptions, including the platform owner.
- **Session table:** `platform_sessions` (separate from tenant `sessions`).
- **Token lifetime:** 8 hours (internal users; refresh required).

### 2.3 Data access

- **`adminPrisma` client** is the only way to make cross-tenant queries.
- Connects as the dedicated `madar_admin` PostgreSQL role (`ADMIN_DATABASE_URL`), whose `admin_full_access` RLS policy grants every row — the ROLE is the privilege; there is no session-variable bypass (ADR 0004).
- Tenant app's `tenantScoped` Prisma client connects as `madar_app` and is filtered by `tenant_isolation` unconditionally.
- Lint rule prevents `adminPrisma` from being imported in `apps/web/*`.

```typescript
// In apps/admin/* — ✅ correct
import { adminPrisma } from '@pos/db/admin';
const tenants = await adminPrisma.tenant.findMany();

// In apps/web/* — ❌ lint error
import { adminPrisma } from '@pos/db/admin';  // FORBIDDEN
```

### 2.4 API boundary

The same NestJS backend serves both apps via two auth guards:
- `TenantAuthGuard` — used on `/v1/...` routes.
- `AdminAuthGuard` — used on `/admin/v1/...` routes.

Routes under `apps/api/src/admin/` use `AdminAuthGuard`. Routes under `apps/api/src/tenant/` use `TenantAuthGuard`. **Cross-realm calls are forbidden** — an admin endpoint cannot accept a tenant JWT and vice versa, enforced at the guard.

### 2.5 Shared code

The admin and tenant apps share:
- The design system (`packages/ui/`).
- Shared types and zod schemas (`packages/shared/`).
- The single API.

They do not share:
- Auth state.
- Translation files (admin is English-only).
- Service workers.

---

## 3. Visual Distinction

Same design system, with three differences to constantly remind operators they are not in a tenant context.

### 3.1 Accent color

The admin app uses **slate teal** (`#4A6B7A`) where the tenant app uses warm coral (`#C96442`).

Implemented via a single HTML class:

```html
<html class="theme-admin">
```

```css
html.theme-admin {
  --color-accent:       var(--color-admin-accent);
  --color-accent-hover: var(--color-admin-accent-hover);
  --color-accent-soft:  var(--color-admin-accent-soft);
}
```

No component code differs. Components read `--color-accent`; the HTML class decides what that points to.

### 3.2 Admin badge

In the top bar, a small slate-teal pill:

```
[Logo]  Admin Panel
```

The pill uses `--color-admin-accent-soft` background, `--color-admin-accent` text, `text-tiny`, weight 600, `--radius-full`.

### 3.3 Impersonation banner

The loudest UI in either app. When a super-admin is "logged in as" a tenant, a **full-width banner at the very top** appears in both apps:

- Background: `--color-danger-soft`.
- Text: `--color-danger`, weight 500.
- Content: "You are viewing as **[Tenant Name]** as **[Super-Admin Name]** · [Exit impersonation]"
- Position: sticky, top, never hides on scroll.
- Height: 40px desktop, 56px mobile (two-line wrap).

This appears in the **tenant app** during impersonation, not the admin app. Inside the admin app it's a header pill. The tenant-app banner is what protects the tenant's trust.

---

## 4. Super-Admin Roles

| Role | Capabilities |
|---|---|
| **Platform Owner** | Everything. Delete tenants. Manage other super-admins. Change platform settings. Read all audit logs. |
| **Finance / Verifier** | Verify payment proofs. Manage invoices. See MRR. Reconcile bank statements. Cannot impersonate or delete. |
| **Support** | View tenants. Impersonate (with banner). Handle tickets. Send announcements. No billing changes. No deletions. |
| **Developer** | System health. Background jobs. Webhooks. Feature flags. No tenant business data access. |
| **Read-only / Investor** | Dashboards and reports only. No tenant detail. No exports. |

The matrix is enforced at both API (`AdminAuthGuard` + permission check) and UI (links hidden) layers.

### 4.1 Default permissions table

| Action | Owner | Finance | Support | Dev | Read-only |
|---|---|---|---|---|---|
| View tenant list | ✓ | ✓ | ✓ | ✗ | ✓ |
| View tenant detail | ✓ | ✓ | ✓ | ✗ | ✗ |
| Edit tenant config | ✓ | ✗ | ✓* | ✗ | ✗ |
| Suspend / activate tenant | ✓ | ✗ | ✓ | ✗ | ✗ |
| Delete tenant | ✓ | ✗ | ✗ | ✗ | ✗ |
| Impersonate (login-as) | ✓ | ✗ | ✓ | ✗ | ✗ |
| Verify payment proofs | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit plans & pricing | ✓ | ✗ | ✗ | ✗ | ✗ |
| Manage platform bank accounts | ✓ | ✓ | ✗ | ✗ | ✗ |
| Send announcements | ✓ | ✗ | ✓ | ✗ | ✗ |
| Manage feature flags | ✓ | ✗ | ✗ | ✓ | ✗ |
| View system health | ✓ | ✗ | ✗ | ✓ | ✓ |
| Manage super-admin team | ✓ | ✗ | ✗ | ✗ | ✗ |
| Read all audit logs | ✓ | ✓ | ✓ | ✗ | ✓ |
| Run reports / dashboards | ✓ | ✓ | ✓ | ✗ | ✓ |

`✓*` Support can edit limited tenant config (status, notes) but not plan or pricing.

---

## 5. Impersonation ("Login as Tenant")

The highest-trust action a super-admin can take. Treated accordingly.

### 5.1 When it's used

- Customer support troubleshooting ("I can't see my products" — admin logs in to verify and reproduce).
- Bug investigation that requires the tenant's exact data context.
- Customer-authorized configuration help.

### 5.2 Rules

1. **Logged before it starts.** A `platform_audit_log` entry is written before the impersonation JWT is minted, including the super-admin's typed reason.
2. **Short-lived token.** Impersonation JWT lifetime: 1 hour max. After expiry, super-admin must re-initiate (with new reason).
3. **Single-tenant scope.** The impersonation token is bound to one tenant. To switch tenants, exit and start a new impersonation.
4. **Visible banner.** The tenant app shows the danger banner (section 3.3) for the entire session.
5. **Double logging.** Every action taken during impersonation writes to **both** logs:
   - Tenant `audit_log` records the action under the impersonated user's ID with an `impersonator_id` foreign key to the super-admin.
   - `platform_audit_log` records the super-admin's action with the target tenant + impersonated user.
6. **Destructive action blocks.** Certain actions are **blocked during impersonation** even if the impersonated user could normally perform them, configurable per environment:
   - Bulk product deletion.
   - Bulk customer deletion.
   - Mass refunds (above a threshold).
   - Changing the tenant's billing details.
   - Deleting a branch.
   - These show a message: "This action is blocked during impersonation. Ask the tenant to do it themselves."
7. **Auto-flagged sessions.** Any impersonation longer than 30 minutes, or involving more than 50 actions, is flagged for review in the admin app at `/audit/impersonation-review`.

### 5.3 Tenant notification

After impersonation ends, an email is sent to the **tenant Owner** users:
> "Our support team accessed your workspace today to help with [reason]. Session: [time]–[time], by [super-admin name]. See activity at [link]."

If the tenant opts out, they can disable this email in settings, but the audit trail remains.

---

## 6. Page Inventory and Phasing

45 total pages across 4 phases. Full UI specs in `PAGES.md` (sections A1–A45).

### 6.1 Phase 1 — MVP (10 pages, must-have to operate)

| # | Page | Route | Audience |
|---|---|---|---|
| A1 | Admin home / dashboard | `/` | All |
| A2 | All tenants list | `/tenants` | Owner, Finance, Support, Read-only |
| A3 | Tenant detail | `/tenants/{id}` | Owner, Finance, Support |
| A4 | Subscription verification queue | `/billing/verification` | Owner, Finance |
| A5 | Payment proof detail | `/billing/verification/{id}` | Owner, Finance |
| A6 | All invoices | `/billing/invoices` | Owner, Finance, Read-only |
| A7 | Platform bank accounts | `/banking/accounts` | Owner, Finance |
| A8 | Super-admin team | `/team` | Owner |
| A9 | Login-as audit log | `/audit/login-as` | Owner, Read-only |
| A10 | Platform audit log | `/audit/platform` | Owner, Read-only |

### 6.2 Phase 2 (10 pages)

| # | Page |
|---|---|
| A11 | Support tickets list |
| A12 | Ticket detail |
| A13 | Email templates editor |
| A14 | Feature flags |
| A15 | System health dashboard |
| A16 | Background jobs monitor (BullMQ UI) |
| A17 | Bank statement import & reconciliation |
| A18 | Aging report |
| A19 | Tenant lifecycle manager |
| A20 | Security events |

### 6.3 Phase 3 (10 pages)

| # | Page |
|---|---|
| A21 | MRR dashboard |
| A22 | Cohort retention |
| A23 | Churn analysis |
| A24 | Geographic distribution |
| A25 | In-app announcements composer |
| A26 | Communication log |
| A27 | Support macros |
| A28 | Usage & limits overview |
| A29 | Tenant data export |
| A30 | Tenant deletion (with safeguards) |

### 6.4 Phase 4 (15 pages)

| # | Page |
|---|---|
| A31 | Plans list |
| A32 | Plan editor |
| A33 | Discount codes |
| A34 | Webhook delivery log |
| A35 | Outbound email log |
| A36 | Advanced bank reconciliation |
| A37 | Roles & permissions editor |
| A38 | Compliance / data residency report |
| A39 | Global audit log |
| A40 | Platform settings |
| A41 | Notification routing |
| A42 | API keys & integrations |
| A43 | Translation overrides |
| A44 | Activity feed (full page) |
| A45 | Impersonation review queue |

---

## 7. Critical Page Specifications

The two most important pages get extra detail. Full specs for all pages are in `PAGES.md` sections A1–A45.

### 7.1 Subscription Verification Queue (A4)

The heart of the admin app. Optimized for verifier productivity.

**Layout: two-pane**

**Left pane — the queue:**
- Filters bar: amount range, currency, days pending, tenant search.
- Sort: oldest first (default), with toggle.
- Each row card:
  - Tenant name (display serif, `text-h3`).
  - Amount + currency (tabular).
  - Days pending (color-coded: green 0–1, amber 2–3, danger 4+).
  - Submitted date (relative time).
- Active row highlighted with `--color-accent-soft` background.

**Right pane — detail:**
- Top: Tenant name + plan + signup date (small, muted).
- **Receipt image viewer** — 60% of pane height. Zoomable (click to zoom, scroll wheel, pinch on touch). Rotate button. Fullscreen toggle.
- Beside (or below on narrow screens): metadata card with:
  - **Expected amount** (display serif, prominent).
  - Submitted amount (if different, flag).
  - Payer name.
  - Transfer date.
  - Bank reference number.
  - Our bank account that should have received it.
- **Match indicators panel** — small chips:
  - ✓ Amount matches OR ⚠ Amount differs by [X]
  - ✓ Reference present OR ⚠ Reference missing
  - ✓ Date plausible OR ⚠ Date suspicious
  - ✓ Account match OR ⚠ Different account expected
- **Action bar** — fixed bottom of right pane:
  - **Approve** — primary, success color, large.
  - **Reject** — danger ghost. Click opens reason modal:
    - Reason code dropdown: Wrong amount / Unreadable receipt / Wrong account / Duplicate / Other.
    - Optional message to tenant (multiline).
    - Confirm.
  - **Request more info** — opens message-to-tenant modal.
  - Notes field (visible after action, for internal audit).

**Keyboard shortcuts (essential for verifier productivity):**

| Key | Action |
|---|---|
| `j` | Next item in queue |
| `k` | Previous item |
| `a` | Approve current |
| `r` | Reject current (opens modal) |
| `i` | Request more info |
| `z` | Zoom image |
| `1`–`5` | Quick-pick rejection reason |
| `Esc` | Close modal |

A small "Keyboard shortcuts" tip card is shown on first visit, with toggle to hide.

**State after action:**
- Item disappears from queue.
- Toast confirms action with undo option (60-second window — beyond that, requires manager override to reverse).
- Next item in queue auto-focuses.

**Empty queue state:**
- Quiet illustration (inbox + checkmark).
- "Inbox zero. Nice."
- Stats: total verified today, average verification time.

### 7.2 Tenant Detail (A3)

The hub for understanding and supporting any tenant.

**Header:**
- Tenant name (display serif `text-h1`).
- Country flag + country name.
- Plan chip (Starter/Growth/Business/Enterprise).
- Status chip (Trial / Active / Grace / Suspended / Cancelled — semantic colors).
- Signup date (small, muted).

**Action buttons (end-side):**
- **"Log in as"** — danger-soft variant (emphasizes audit gravity). Opens reason modal before initiating impersonation.
- **"Send message"** — opens in-app message composer.
- **"Manage plan"** — opens plan-change drawer.
- **⋯ menu:** Suspend, Activate, Export data, Delete (Owner role only).

**Tabs:**

**Overview tab:**
- Stats row: Total revenue (their POS, lifetime), Transactions all-time, Active branches, Active users.
- Usage vs. plan: progress bars for transactions/mo, storage, branches, users. Bar turns warning when > 80%, danger when > 95%.
- Recent invoices (last 5).
- Recent activity (last 10 events).

**Branches tab:**
- Table of branches with: name, address, status, today's sales.

**Users tab:**
- Table: name, email, role, branches, last seen, status.

**Billing tab:**
- Current subscription status with state machine visualization.
- Invoices list (link to invoice detail).
- Payment proofs history (link to proof detail).
- Plan changes history.

**Activity tab:**
- Audit log filtered to this tenant.

**Notes tab:**
- Internal support notes (super-admin only, never shown to tenant).
- Threaded comments by super-admins.

---

## 8. Database Tables (Admin-Specific)

These tables are **not** tenant-scoped. They have no `tenant_id` column and live outside RLS.

### 8.1 `platform_users`

```sql
CREATE TABLE platform_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN
                    ('platform_owner', 'finance', 'support', 'developer', 'read_only')),
  mfa_secret      TEXT NOT NULL,  -- TOTP secret, encrypted at rest
  mfa_enabled     BOOLEAN NOT NULL DEFAULT false,  -- false only during initial setup
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  last_login_ip   INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,  -- references platform_users(id), nullable for initial seed
  invited_by      UUID
);
```

### 8.2 `platform_sessions`

```sql
CREATE TABLE platform_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES platform_users(id),
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  ip              INET NOT NULL,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_platform_sessions_user ON platform_sessions(platform_user_id);
```

### 8.3 `platform_audit_log`

```sql
CREATE TABLE platform_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES platform_users(id),
  action          TEXT NOT NULL,  -- e.g., 'tenant.suspend', 'payment_proof.approve'
  target_type     TEXT,  -- e.g., 'tenant', 'payment_proof', 'platform_user'
  target_id       UUID,
  target_tenant_id UUID,  -- if action affects a specific tenant
  before          JSONB,
  after           JSONB,
  reason          TEXT,  -- typed reason for sensitive actions
  ip              INET NOT NULL,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_audit_user_time ON platform_audit_log(platform_user_id, occurred_at DESC);
CREATE INDEX idx_platform_audit_tenant_time ON platform_audit_log(target_tenant_id, occurred_at DESC);
CREATE INDEX idx_platform_audit_action ON platform_audit_log(action);

-- Append-only enforcement
CREATE OR REPLACE RULE platform_audit_log_no_update AS
  ON UPDATE TO platform_audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE platform_audit_log_no_delete AS
  ON DELETE FROM platform_audit_log DO INSTEAD NOTHING;
```

### 8.4 `platform_bank_accounts`

See `billing-flow.md` section 5.1.

### 8.5 `plans`

```sql
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,  -- 'starter', 'growth', 'business', 'enterprise'
  name            JSONB NOT NULL,  -- { en, ar } (in case admin app becomes bilingual)
  description     JSONB,
  prices          JSONB NOT NULL,  -- { "USD": 2900, "SAR": 11000, ... } in minor units
  limits          JSONB NOT NULL,  -- { branches: 1, users: 3, transactions_per_month: 1500 }
  features        TEXT[] NOT NULL DEFAULT '{}',
  trial_days      INTEGER NOT NULL DEFAULT 14,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 8.6 `feature_flags`

```sql
CREATE TABLE feature_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  description     TEXT,
  default_value   BOOLEAN NOT NULL DEFAULT false,
  rollout_strategy TEXT NOT NULL CHECK (rollout_strategy IN
                    ('off', 'on', 'specific_tenants', 'percentage')),
  target_tenant_ids UUID[],
  rollout_percentage INTEGER CHECK (rollout_percentage BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 9. Build Order

Following the master sequence in `CLAUDE.md`:

**During Phase 1:**
1. Scaffold `apps/admin/` (Next.js, separate from `apps/web/`).
2. Implement admin auth flow (login, MFA setup, session management).
3. Build the 10 MVP pages in order: home → tenants list → tenant detail → verification queue → proof detail → invoices → bank accounts → team → audit logs.
4. Build the `platform_audit_log` infrastructure first, so every other page can write to it from day one.
5. Implement impersonation last in Phase 1, after all other pages exist (it's the highest-risk feature).

**During Phase 2–4:** add pages per the inventory in section 6.

---

## 10. Testing

### 10.1 Required tests

- **Auth realm isolation:** a tenant JWT presented to an admin route returns 401. An admin JWT presented to a tenant route returns 401.
- **RLS bypass works only for `adminPrisma`:** `tenantScoped` queries from the API for a super-admin context still respect RLS (super-admins use a different code path entirely).
- **Impersonation double-logging:** every action during impersonation writes to both audit logs in the same transaction.
- **Destructive-action block:** blocked actions return a clear error and write to `platform_audit_log` as `attempted_blocked_action`.
- **MFA enforcement:** super-admin login without MFA returns to MFA setup; cannot access any other page.

### 10.2 E2E tests

Playwright specs in `apps/admin/e2e/`:
- Login + MFA flow.
- Tenant search and detail.
- Verification approve and reject flows.
- Bank account CRUD.
- Impersonation start → take action → exit → verify both audit logs.
- Permission-based UI hiding (login as each role, assert correct links visible).

---

## 11. Operational Runbook (Briefly)

### 11.1 Onboarding a new super-admin

1. Existing Platform Owner invites via `/team`.
2. Invitee receives email with one-time signup link.
3. Sets password.
4. Forced through MFA setup (scan QR with authenticator app, enter 6-digit code to confirm).
5. Lands on admin home.

### 11.2 Removing a super-admin

1. Platform Owner sets account to inactive at `/team/{id}/edit`.
2. All active sessions revoked immediately.
3. Account retained in `platform_users` for audit history. **Never hard-deleted.**

### 11.3 Suspected breach response

1. Platform Owner can mass-revoke all sessions at `/team/revoke-all`.
2. All super-admins must re-login and re-verify MFA.
3. Audit log reviewed for suspicious actions from the time window.
4. Consider rotating `ADMIN_JWT_SECRET` (forces all sessions invalid).

---

## 12. Reference

- App location: `apps/admin/`
- API location: `apps/api/src/admin/`
- Page specs: `PAGES.md` sections A1–A45
- Design system: `design-system.md`
- Multi-tenancy rules: `CLAUDE.md` Multi-Tenancy section
- Payment flow: `billing-flow.md`
