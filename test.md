# Madar — pre-production smoke test

Manual end-to-end smoke covering every shipped feature. Run on **localhost** with the seed data BEFORE deploying to the VPS. Target: ~90 minutes to walk through everything.

Each section has:
- **Pre** — what must be true before the check
- **Do** — the actions to perform
- **Expect** — the observable result
- **If it fails** — where to look first

If anything fails: **don't deploy**. Fix locally first.

---

## 0. Pre-flight (15 min)

### 0.1 Stack up

```bash
docker compose up -d postgres redis minio
pnpm db:migrate
pnpm db:seed
pnpm dev:api    # :4000
pnpm dev:web    # :3000  (in a second terminal)
pnpm dev:admin  # :3001  (in a third terminal)
```

- [ ] All three terminals show their respective ports without errors.
- [ ] `curl http://localhost:4000/healthz` returns `{"status":"ok"}`.
- [ ] `http://localhost:3000` redirects to `/en/login`.
- [ ] `http://localhost:3001` redirects to `/login`.
- [ ] MinIO console at `http://localhost:9001` lets you log in with `madar / madar-dev-only`.

### 0.2 Seed data sanity

```bash
docker compose exec postgres psql -U madar madar -c \
  "SELECT slug, status, default_currency_code FROM tenants;"
```

- [ ] One row: `bayt-coffee | trialing | EGP` (or your seed's variant).
- [ ] Seed users present:
```bash
docker compose exec postgres psql -U madar madar -c \
  "SELECT email, role FROM users WHERE deleted_at IS NULL;"
```
- [ ] Has `owner@acme.test`, 5 cashiers, etc.

### 0.3 i18n parity gate

```bash
pnpm i18n:check
```

- [ ] Reports `i18n check passed · 2421 keys in EN/AR lockstep` (or current total).
- [ ] No `__TODO_AR__` markers.

### 0.4 RLS canaries

```bash
pnpm test:rls
```

- [ ] All canaries green (≥66 tests).

---

## 1. Authentication (10 min)

### 1.1 Signup → email verification

- **Pre**: stack up, no existing tenant for the slug you'll pick.
- **Do**:
  1. Open `http://localhost:3000/en/signup`.
  2. Fill all fields. Pick a unique slug like `test-shop-1`.
  3. Submit.
- **Expect**:
  - 201 + redirect to `/en/` dashboard.
  - `apps/api/var/sent-emails/*welcome*test-shop-1*.eml` exists.
  - `apps/api/var/sent-emails/*email_verification*test-shop-1*.eml` exists.
- **Verify the verify-email link**:
  1. `grep verifyUrl apps/api/var/sent-emails/*email_verification*test-shop-1*.eml` → extract the token.
  2. Open the URL in a fresh tab.
- **Expect**: green check + "Email verified" message. psql confirms `email_verified=true`.
- **If it fails**: check API logs for `email_verification send failed` warnings.

### 1.2 Login + remember me

- **Do**: log out → log in as `owner@acme.test / Demo123!`, tick **Keep me signed in**.
- **Expect**:
  - Lands on `/en/`.
  - DevTools → Application → Cookies → `madar_refresh` cookie has `Max-Age=2592000` (30d).
- **Do (negative)**: refresh tab → still logged in.

### 1.3 Forgot password → reset

- **Do**:
  1. Logout → `/en/forgot-password` → submit `owner@acme.test`.
  2. Open the newest `*password_reset*owner_acme_test*.eml`, extract the link.
  3. Open it in a new tab → set new password `NewPass123!`.
  4. Login with new password.
- **Expect**: each step succeeds.
- **Do (cleanup)**: change password back to `Demo123!` via `/settings/profile` → **Change password**.

### 1.4 MFA enrollment + login

- **Do**:
  1. `/settings/security` → **Enable 2FA**.
  2. Scan QR with Authy/Google Authenticator, enter the 6-digit code.
  3. **Copy the recovery codes** to a note file.
  4. Logout → login → MFA challenge appears → enter TOTP.
- **Expect**: post-MFA, lands on `/en/` with `mfa_enabled=true` in `/settings/security`.
- **Do (recovery)**: logout → login → use a recovery code instead of TOTP.
- **Expect**: works once; same code refused on the second use.

### 1.5 Owner-resets-staff password

- **Pre**: another active user exists (use the `cashier-cair@acme.test` or invite one via `/settings/users`).
- **Do**: `/settings/users` → row → **Reset password** → confirm.
- **Expect**: toast "Reset link sent to {email}", `*password_reset*{cashier_email}*.eml` appears.
- **If it fails**: check API logs for `password_reset email failed`.

### 1.6 Profile self-service

- **Do** (as the owner):
  1. `/settings/profile` → change name → Save → topbar reflects.
  2. Switch locale to AR → page reloads RTL.
  3. Switch back to EN.
  4. Click **Change email** → new address + password → toast appears, new `email_verification` email on disk.
  5. Click **Change password** → wrong current → inline error. Correct current + strong new → redirected to login.

---

## 2. POS sell screen (15 min)

### 2.1 Cash sale

- **Pre**: logged in as a cashier (or owner). Branch is selected.
- **Do**:
  1. Open shift via `/pos` (modal appears) — opening float `2000` (= $20.00) → Open.
  2. Click a few products to add to cart.
  3. Tap **Pay** → **Cash** → enter tendered amount → **Complete**.
- **Expect**:
  - Toast `TX-XXXXXX completed`, "Open receipt →" link.
  - psql: `SELECT code, payment_status, total_cents FROM sales ORDER BY created_at DESC LIMIT 1;` → matches.
  - `stock_movements` has one `sale` row per line.
  - `branch_stock.qty_on_hand` decremented.

### 2.2 Card / bank transfer / store credit / split

- **Card**: select Card → enter approval code (4+ chars) → Complete. Confirms `payment_status='paid'`, `approval_code` last 4 in audit.
- **Bank transfer**: upload a JPG receipt → enter payer name → submit. `payment_status='payment_pending'`. Inventory still decremented.
- **Store credit**: attach a customer with non-zero balance → Pay with Store Credit → balance drops, ledger row appears at `/customers/[id]/store-credit`.
- **Split**: 1 cash + 1 card slice summing to total → completes; `payment_method='split'`.

### 2.3 Held tickets

- **Do**: add items → **Hold** → enter name → Resume from the tray → cart restored.

### 2.4 Customer picker

- **Do**: tap the customer chip → search by phone → pick → chip shows. Tap again → Detach.

### 2.5 Offline POS

- **Do**:
  1. DevTools → Network → throttle to "Offline".
  2. Ring a cash sale.
- **Expect**: header chip flips to "Offline · 1 pending". Toast says queued.
- **Do**: switch back to "Online" → chip flips to "Syncing 1" then "Online".
- **Verify**: psql shows the sale with `offline_completed=true`.

### 2.6 Tax preview

- **Pre**: one product is in a tax class with rate > 0.
- **Do**: add it to cart.
- **Expect**: cart shows three rows — Subtotal · Tax · Total. Inclusive vs exclusive matches `tenant.tax_inclusive_default`.

### 2.7 Cash-drawer (if you have a Star/Epson printer)

- **Pre**: Chrome/Edge, dev URL is `localhost` (WebUSB allows this).
- **Do**: open a fresh receipt → click **Open drawer** → permission dialog → pick the printer.
- **Expect**: drawer pops. Subsequent cash receipts auto-pop (no dialog).
- **If you don't have a printer**: skip — confirmed via docs.

---

## 3. Sales history + refunds (10 min)

### 3.1 Sales list

- **Do**: `/sales` → see the sales you rang above.
- **Expect**:
  - Filters work (date range narrows; status chip narrows).
  - Status pills colored correctly (paid sage, pending amber, refunded muted).
  - Click a row → opens the receipt.

### 3.2 Receipt page

- **Do**: open any receipt → switch between 80mm / 58mm via the link.
- **Expect**:
  - Tenant logo renders at the top (after you upload one in §6.4).
  - Print preview (`Ctrl+P`) shows compact receipt.

### 3.3 Refund flow

- **Pre**: a paid sale exists with multiple line items.
- **Do**:
  1. Receipt → **Refund** button.
  2. Step 1: pick one line, qty 1. Verify total updates live.
  3. Step 2: Cash refund method → Next.
  4. Step 3: Submit.
- **Expect**:
  - Toast `RFN-XXXXXX completed`.
  - Receipt now shows reduced effective payment (or `payment_status='refunded'` if fully refunded).
  - `stock_movements` has `return_in` row (since restock=true default).
  - `branch_stock.qty_on_hand` incremented back.

### 3.4 Refund — store-credit flow

- **Do**: refund a line; method = Store credit; pick a customer.
- **Expect**:
  - Customer's `store_credit_balance_minor` increases by the refund amount.
  - `/customers/[id]/store-credit` shows the positive ledger entry with `reference_table=refund`.

### 3.5 Refund — manager approval (over threshold)

- **Pre**: env `REFUND_MANAGER_THRESHOLD_CENTS=5000` (default $50).
- **Do**:
  1. Logged in as cashier, try to refund > $50.
  2. Submit.
- **Expect**: 403 → modal opens with approver dropdown.
- **Do**: pick an active owner/manager → confirm.
- **Expect**: refund completes; `requires_manager=true` + `approved_by_user_id` populated.

---

## 4. Shifts + reconciliation (5 min)

### 4.1 Close shift + Z-report

- **Do**: open shift → ring sales (incl. one cash refund) → `/pos` header → **End shift** → enter declared cash → Confirm.
- **Expect**:
  - Lands on `/shifts/[id]` Z-report.
  - `expected_closing_cash_cents = opening + Σ cash sales − Σ cash refunds`.
  - `cash_refunds_cents` matches the refund you booked.
  - Variance shows green (0) or rose (negative) / sage (positive).

### 4.2 Reconciliation page

- **Do**: `/reconcile` → today's date.
- **Expect**:
  - Per-branch panel shows the shift you just closed.
  - Chain total card sums correctly.
  - By-payment breakdown matches.
  - Click **Print** → browser print preview shows only the report (no shell chrome).

---

## 5. Inventory (10 min)

### 5.1 Products CRUD

- **Do**:
  1. `/inventory/products/new` → fill EN+AR names, SKU, price, cost → Save.
  2. Find it in `/inventory` (search by SKU) → click → **Edit** → change price → Save.
  3. Row menu → **Delete** → confirm.
- **Expect**: each step works; deleted product disappears from default list (soft delete).

### 5.2 Image upload

- **Do**: edit a product → upload a JPG ≤5MB → Save.
- **Expect**: thumbnail renders in the products grid. `public/tenants/{tid}/products/{pid}.jpg` exists in storage.

### 5.3 CSV import

- **Do**:
  1. `/inventory` → header → **Import CSV** → **Download template**.
  2. Edit the template: 3 rows with unique SKUs.
  3. Upload → **Preview** (dry run).
- **Expect**: Created: 3, Errors: 0.
- **Do**: **Import**.
- **Expect**: products appear in `/inventory`.
- **Do (negative)**: re-upload the same CSV (should update, not create duplicates).
- **Expect**: Created: 0, Updated: 3.

### 5.4 Stock adjustments

- **Do**: select rows → **Adjust stock** → enter signed qty + note → Submit.
- **Expect**: `branch_stock.qty_on_hand` reflects the change. `stock_movements` has an `adjustment` row.

### 5.5 Stock movements ledger

- **Do**: `/inventory/movements` (or header → **Movements**).
- **Expect**:
  - All movements visible. Filter by kind → narrows. Filter by user → narrows.
  - Click a row → drawer with all fields + "Open linked entity →" deep link.

### 5.6 Stock transfers

- **Do**:
  1. `/transfers/new` → from/to branches → pick products + qty → Save and send.
  2. Switch to the receiver-branch perspective (or as manager).
  3. `/transfers/[id]` → enter received qty (mismatch on one line) → Confirm.
- **Expect**:
  - Sender `branch_stock` decremented on Send.
  - Receiver `branch_stock` incremented on Receive.
  - Discrepancy line flagged.

### 5.7 Reorder + low-stock badge

- **Do**: set a product's `reorder_point` to 999 via the form.
- **Expect**: it now shows a "Low" badge in the list and a rose stripe.

---

## 6. Settings (10 min)

### 6.1 Profile

Already covered in §1.6.

### 6.2 Security

Already covered in §1.4.

### 6.3 Users

- **Do** (as owner):
  1. `/settings/users` → **Invite user** → fill email + role → Submit.
  2. The new user shows up with "Pending invite" pill.
  3. Resend invite (different action) → another `staff_invite` `.eml`.
  4. Edit the user → change role to `manager` → Save.
  5. Deactivate → confirm → row goes amber.
  6. Reactivate.

### 6.4 Business

- **Do**:
  1. `/settings/business` → edit name (EN+AR), legal name, tax ID, pick a business type, change fiscal year start month.
  2. Click Save → toast "Saved".
- **Expect**: refresh → values persist. psql `SELECT * FROM tenants WHERE slug=...` shows the changes.
- **Logo upload**:
  1. Branding section → **Upload logo** → pick a JPG/PNG ≤5MB.
  2. Open `/v1/public/tenants/{tenantId}/logo` directly in browser → image renders.
  3. Ring a sale → open receipt → logo appears above the shop name.

### 6.5 Tax classes

- **Do**: `/settings/tax-classes` → add a class (`STD-14`, rate 14%) → set default → confirm.
- **Expect**: products without an explicit class now inherit 14% tax in POS preview.

### 6.6 Notifications matrix

- **Do**:
  1. `/settings/notifications` → matrix loads with all defaults `on`.
  2. Toggle `low_stock × email` off → confirm cell updates.
  3. Audit row check: psql `SELECT * FROM audit_log WHERE action='notification_prefs_updated';` → row exists with diff.

---

## 7. Branches, suppliers, purchases (10 min)

### 7.1 Branches

- **Do**: `/branches` → cards visible. Click one → tabs (Overview / Stock / Banking / Hours / Settings).
- **Verify**:
  - Stock tab: paginated per-branch stock.
  - Banking tab: lists tenant bank accounts.
  - Hours tab: edit operating hours + add a holiday → Save.
  - Add a new branch via `/branches/new`. (Pin map coords if you want.)

### 7.2 Per-branch dashboard

- **Do**: `/branches/[id]/dashboard`.
- **Expect**: hero KPI, hourly chart (SVG, no Recharts), top categories donut, leaderboard.

### 7.3 Suppliers

- **Do**: `/suppliers/new` → save → opens detail. Tabs work (Overview / Catalog / POs / Documents / Activity). Add a catalog product. Upload a supplier document (PDF).

### 7.4 Purchase orders

- **Do**:
  1. `/purchases/new` → pick supplier + branch + add line items → Save as draft.
  2. Open the PO → **Send to supplier** → email modal → Send.
  3. Open the PO → **Receive** → fill received qty → Submit.
- **Expect**:
  - Sender → email .eml lands.
  - Receive writes `stock_movements{kind='receive'}` + bumps `branch_stock`.
  - PDF download link works (open in new tab).

### 7.5 Supplier returns (RMA)

- **Do**: `/returns/new` → fill line items → Save draft → Send → Refund.
- **Expect**: stock movement adjustment fires on Send. State transitions correctly.

---

## 8. Reports (5 min)

For each: open the route, change a filter, hit "Apply" or use the natural date defaults.

### 8.1 P&L
- **Do**: `/reports/pnl` → group_by=branch → CSV download.
- **Expect**: table shows Revenue − Discount − Tax − COGS = Gross Profit, − Refunds = Net Revenue. CSV opens cleanly in Excel.

### 8.2 Movers
- **Do**: `/reports/movers` → switch metric (revenue / units / profit) → top-N reorders.

### 8.3 Trends
- **Do**: `/reports/trends` → switch window (7d / 30d / 90d) + compare to prev period.

### 8.4 Tax
- **Do**: `/reports/tax` → **Download PDF** → opens a styled PDF with per-tax-class breakdown.

### 8.5 Scheduled reports
- **Do**: `/reports/scheduled` → **+ New schedule** → daily P&L → owner@acme.test → Save → **Run now** → check `var/sent-emails/` for the email with attachment.

---

## 9. Subscription billing (5 min)

### 9.1 Pay a subscription invoice (bank transfer)

- **Pre**: seed has `INV-2026-06-001` in `awaiting_payment`. (If not, create one via admin.)
- **Do**:
  1. `/billing` → **Invoices** tab → click **Pay** on the awaiting invoice.
  2. Step 1: bank picker, copy IBAN. Step 2: upload a receipt JPG + fill payer + ref. Step 3: success.
- **Expect**: invoice flips to `in_review`. Proof appears in admin queue.

### 9.2 Suspension banner

- **Do**: psql `UPDATE tenants SET status='suspended' WHERE slug='bayt-coffee';`.
- **Expect**:
  - Within 30s (Redis cache TTL), navigating any non-billing route shows the rose suspension banner + redirects to `/billing`.
  - Try `POST /v1/products` from devtools — returns 423 `tenant_suspended`.
- **Do (revert)**: `UPDATE tenants SET status='active' WHERE slug='bayt-coffee';`.

---

## 10. Admin app (10 min)

### 10.1 Login + MFA

- **Do**: `http://localhost:3001/login` → `admin@platform.test / Admin123!` → MFA from seed log.
- **Expect**: lands on `/`.

### 10.2 Dashboard

- **Do**: `/` (admin).
- **Expect**: 5-card KPI strip, verification snapshot, recent activity feed.

### 10.3 Tenants list + detail

- **Do**: `/tenants` → filters work → click your seed tenant.
- **Expect**: KPI strip, recent invoices, branches table, users sidebar.

### 10.4 Impersonation

- **Do**:
  1. Tenant detail → **Log in as** → pick the owner user → type a reason → Submit.
  2. New tab opens to tenant app, logged in as the owner with a rose banner across the top.
  3. Ring a sale → `audit_log.impersonator_id` is populated.
  4. Try to delete a product → 403 `forbidden_during_impersonation`.
  5. Click **Exit impersonation** in the banner → redirected back to admin.
- **Expect**: every step works. `platform_audit_log` has `impersonation_started` + `impersonation_ended`.

### 10.5 Verification queue

- **Pre**: §9.1 left a pending subscription proof.
- **Do**: `/verification` → click the row → **Approve**.
- **Expect**:
  - Proof flips to `verified`.
  - Tenant invoice flips to `paid`.
  - Tenant's `payment_received` `.eml` lands.

### 10.6 Cross-tenant invoices

- **Do**: `/invoices` → filter chips work; click tenant column → tenant detail.

### 10.7 Login-as audit

- **Do**: `/login-audit` → see the impersonation session from §10.4 with the action count > 0.

### 10.8 Platform audit log

- **Do**: `/platform-audit` → filter by `action_prefix=impersonation` → narrows to your impersonation events.

---

## 11. Cron jobs (5 min)

### 11.1 Trial-ending reminder

- **Do**:
  1. psql: `UPDATE tenants SET trial_ends_at=now() + interval '2.5 days', trial_reminder_sent_at=NULL WHERE slug='bayt-coffee';`
  2. Admin app → login → curl `POST /v1/admin/cron/trial-reminders/run-now` (or hit via Postman with the admin Bearer).
- **Expect**: `.eml` lands; `trial_reminder_sent_at` set. Run again → no second send.

### 11.2 Low-stock digest

- **Do**:
  1. psql: `UPDATE branch_stock SET qty_on_hand=0 WHERE product_id=(SELECT id FROM products LIMIT 1);`
  2. `POST /v1/admin/cron/low-stock/run-now`.
- **Expect**: `.eml` with the low-stock product. `last_low_stock_alert_at` bumped.
- **Negative**: mute via `/settings/notifications` → run-now again → no email.

### 11.3 Billing tracker

- **Do**: `POST /v1/admin/billing/tick`.
- **Expect**: returns the per-step counter report. No errors.

---

## 12. Cross-cutting (5 min)

### 12.1 RTL

- **Do**: switch locale to `ar` on a few representative pages: `/pos`, `/sales`, `/inventory`, `/settings/profile`, `/reconcile`.
- **Expect**:
  - All flips RTL.
  - No truncated/clipped text.
  - Icons that should mirror do (arrows etc.); icons that shouldn't (logos, brand) don't.

### 12.2 Dark mode

- **Do**: toggle dark mode (or set `<html data-theme="dark">` in DevTools).
- **Expect**: no harsh contrast issues; accent + sage + rose pills still legible.

### 12.3 Mobile (or DevTools mobile viewport)

- **Do**: 375×667 viewport.
- **Expect**:
  - POS sell screen usable (cart wraps under products).
  - Sales history scrolls horizontally without breaking.
  - Inventory grid collapses to one column.

### 12.4 Empty states

- **Do**: visit `/customers/new` → submit one customer → log in as a freshly-signed-up tenant with no data.
- **Expect**:
  - `/inventory` shows the empty state with **+ Product** CTA.
  - `/sales` shows "No sales yet" message.
  - `/reconcile` shows zero totals + "No shifts opened for this day".

### 12.5 Error states

- **Do**: Stop the API (`Ctrl+C` on `pnpm dev:api`) → reload `/inventory`.
- **Expect**: error state + Retry button. No infinite spinner. Restart api → Retry → loads.

---

## 13. Backup verification (5 min)

- **Do**:
  1. `docker compose --profile backup up -d backup` → check logs.
  2. `docker compose run --rm backup backup` → manual one-off.
- **Expect**:
  - MinIO console → `madar-backups` bucket has `madar-YYYYMMDDTHHMMSSZ.pg.gz`.
- **Restore drill** (only if you have ~5 min for a clean test):
  ```bash
  # Take a fresh dump first
  docker compose run --rm backup backup
  # Burn it down
  docker compose down
  docker volume rm madar_pgdata
  docker compose up -d postgres
  pnpm db:migrate
  docker compose run --rm backup restore latest
  ```
- **Expect**: log back in as `owner@acme.test` — everything you created above is back.

---

## 14. Production-readiness checks (5 min)

### 14.1 No console.error noise

- **Do**: open DevTools console on `/pos`, `/sales`, `/inventory`, `/settings/business`, `/reconcile`. Click around.
- **Expect**: no red errors. Warnings (e.g. Sentry DSN unset) are fine.

### 14.2 No secrets leaked

```bash
grep -RIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  -E "RESEND_API_KEY|JWT_TENANT_SECRET|JWT_ADMIN_SECRET|POSTGRES_PASSWORD|S3_SECRET_KEY" .
```

- **Expect**: matches only in `.env.example`, `.env.production.example`, `docs/`, and `tasks.md` — never in `apps/`.

### 14.3 Build clean

```bash
pnpm --filter @madar/api typecheck
pnpm --filter @madar/web typecheck && pnpm --filter @madar/web build
pnpm --filter @madar/admin typecheck && pnpm --filter @madar/admin build
```

- **Expect**: all four exit 0. No type errors.

### 14.4 API test suite

```bash
pnpm --filter @madar/api test
```

- **Expect**: full green. If anything fails, **don't deploy** until fixed.

---

## Sign-off

If every box above is ticked:

- [ ] All 14 sections passed.
- [ ] No new `console.error` in the browser.
- [ ] All tests green.
- [ ] Backup + restore drill complete.

You're ready to deploy. Follow `docs/deployment.md` step-by-step.

---

## Known acceptable behaviors (NOT failures)

- `var/sent-emails/` fills up — that's the disk email provider. Will go away once `EMAIL_PROVIDER=resend` in prod.
- `console.warn` about Sentry DSN missing — only fires when DSN env vars are unset. Set them in prod.
- "Could not find dependency `prisma`" between rapid test runs — Windows + pnpm transient. Re-run.
- `attrib +P` warnings on `.next/` — moot since `.next` now lives in `~/.madar-cache/` per the OneDrive fix.
- WebUSB "Open drawer" button missing in Firefox — by design; Chrome/Edge only.
