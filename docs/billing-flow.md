# billing-flow.md — Bank Transfer Payment Specifications

Detailed specification for both payment flows in the platform:
1. **Subscription billing** — tenants paying the platform (us) for their plan.
2. **POS sales** — customers paying tenants for goods in-store.

Both flows use the same underlying `payment-proof` module but differ in who submits, who verifies, and what state transitions follow.

> **Companion documents:** `PRD.md` section 4.8 (high-level), `CLAUDE.md` (build rules), `admin-app.md` (verifier UI).

---

## 1. Why Bank Transfer Instead of a Payment Gateway

The platform deliberately does **not** integrate with Stripe, Paymob, Tap, PayTabs, or any other payment processor. Reasons:

1. **Regional flexibility** — gateways have inconsistent coverage and high fees in MENA, Africa, and parts of Asia.
2. **Operational independence** — we don't want our cashflow blocked by a processor decision or a chargeback dispute.
3. **Customer trust** — many SMB customers prefer bank transfer for high-value items.
4. **Simplicity** — fewer integrations to maintain, fewer compliance regimes (no PCI scope).

Trade-off: verification is a manual operation. We mitigate with keyboard-driven UI, bank statement reconciliation, and fuzzy matching.

---

## 2. The Shared `payment-proof` Module

One reusable module handles both flows. Lives in `apps/api/src/shared/payment-proof/`.

### 2.1 Database table

```sql
CREATE TABLE payment_proofs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  context         TEXT NOT NULL CHECK (context IN ('subscription', 'sale')),
  reference_id    UUID NOT NULL,  -- subscription_invoice_id OR sale_id
  amount          BIGINT NOT NULL,  -- minor units (cents)
  currency_code   CHAR(3) NOT NULL,
  bank_account_id UUID NOT NULL,  -- which account they sent to
  payer_name      TEXT NOT NULL,
  payer_bank      TEXT,
  transfer_date   DATE NOT NULL,
  transfer_reference TEXT NOT NULL,  -- bank's transaction reference
  receipt_image_url TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'verified', 'rejected', 'cancelled')),
  verified_by     UUID,  -- platform_user_id or tenant user_id
  verified_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  rejection_code  TEXT,  -- enum: 'wrong_amount', 'unreadable', 'wrong_account', 'duplicate', 'other'
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID NOT NULL,
  -- Audit fields
  client_ip       INET,
  user_agent      TEXT
);

CREATE INDEX idx_payment_proofs_tenant_status ON payment_proofs(tenant_id, status);
CREATE INDEX idx_payment_proofs_context_ref ON payment_proofs(context, reference_id);
CREATE INDEX idx_payment_proofs_pending ON payment_proofs(created_at) WHERE status = 'pending';
```

### 2.2 State machine

```
            ┌─────────────────────────────────┐
            │                                 │
            ▼                                 │
   ┌──────────────┐    approve    ┌─────────────┐
   │   pending    │──────────────▶│   verified  │
   └──────────────┘                └─────────────┘
            │
            │ reject
            ▼
   ┌──────────────┐    resubmit
   │   rejected   │────────┐
   └──────────────┘        │
                            │
                            └──▶ (new payment_proof in pending)

   ┌──────────────┐
   │  cancelled   │  ← from pending, by submitter
   └──────────────┘
```

**Rules:**
- `pending → verified` is one-way. Verification is immutable. Reverting requires creating a manager-override correction entry, never editing.
- `pending → rejected` requires a reason code and message.
- `rejected → pending` is not a direct transition. The payer must submit a **new** `payment_proof` linked to the same reference.
- `pending → cancelled` is the payer aborting before verification (e.g., realized they didn't actually transfer).

### 2.3 Receipt image handling

- **Accepted formats:** JPG, PNG, PDF.
- **Max size:** 5MB per upload.
- **Server-side processing pipeline:**
  1. Reject if MIME type doesn't match extension.
  2. Reject if size > 5MB.
  3. Run through ClamAV. Reject on hit.
  4. Strip EXIF metadata (location data is a privacy leak).
  5. Resize so the long edge ≤ 2000px (preserve aspect).
  6. Re-encode JPG quality 85, PNG lossless, PDF passes through.
  7. Generate 300px thumbnail for list views.
  8. Store at `tenants/{tenant_id}/payment-proofs/{proof_id}.{ext}` in S3.
  9. Generate signed URL (24-hour expiry) when displaying.
- **Retention:** 7 years. Audit and tax compliance.

### 2.4 Notifications

On every state transition, notify the payer through their preferred channels (in-app + email, optionally WhatsApp). Templates are bilingual.

| Event | Recipient | Subject |
|---|---|---|
| Submitted | Payer | "We received your payment receipt — verification in progress" |
| Verified | Payer | "Your payment was verified" (with PDF receipt attached) |
| Rejected | Payer | "Your payment couldn't be verified — action needed" (with reason) |
| Request more info | Payer | "We need a clearer receipt or more details" |

---

## 3. Subscription Billing Flow (Tenant Pays Platform)

### 3.1 Lifecycle states

```
   ┌──────────┐    14 days     ┌──────────┐
   │   trial  │──────────────▶│ trial_end │
   └──────────┘                 └──────────┘
                                     │
                          invoice    │
                          generated  ▼
                              ┌─────────────────┐
                              │ awaiting_payment│
                              └─────────────────┘
                                     │
                          proof      │
                          submitted  ▼
                              ┌─────────────────┐
                              │payment_submitted│
                              └─────────────────┘
                                  │       │
                          verified │       │ rejected
                                   ▼       ▼
                              ┌──────┐  back to awaiting_payment
                              │active│  (with grace period clock)
                              └──────┘
                                  │
                          next renewal due
                                  ▼
                              ┌─────────────────┐
                              │ awaiting_payment│
                              └─────────────────┘
```

**Past-due states:**

```
   active → grace_period (0-7 days past due, full access)
         → suspended (8-30 days past due, read-only)
         → cancelled (31+ days, read-only export window 90 days)
```

### 3.2 Step-by-step UX

**Step 1: Signup**
- Tenant signs up, fills onboarding wizard.
- Subscription created with `status = trial`, `trial_ends_at = now() + 14 days`.
- No payment info requested.

**Step 2: Trial reminders**
- Day 11 (3 days before trial end): email + in-app banner: "Your trial ends in 3 days. Pick a plan to keep going."
- Day 13 (1 day before): email + banner: "Your trial ends tomorrow."
- Day 14 (trial end): subscription → `awaiting_payment`. Invoice generated.

**Step 3: Invoice generation**
- System creates a `subscription_invoice` with: line items (plan × period × branches), total in tenant's currency, due date (7 days from issue), reference code (unique, must be cited in transfer).
- Email sent with PDF invoice and link to the Pay Invoice page.

**Step 4: Tenant pays (manual, off-platform)**
- Tenant logs into bank, transfers the invoice total to one of our bank accounts shown in the invoice.
- Critical: tenant must include the **reference code** in the bank transfer description.

**Step 5: Tenant uploads proof**
- Goes to `/billing/invoices/{id}/pay` in tenant app.
- Sees our bank accounts (filtered to their currency), copy-to-clipboard for each.
- Uploads receipt image (drag-or-tap zone).
- Fills: payer name, transfer date, bank reference number.
- Submits → `payment_proof` row created with `context = 'subscription'`, status = `pending`.
- Invoice status → `payment_submitted`.
- Tenant sees confirmation screen: "Your payment is being verified. You'll be notified within 24 hours. You still have full access."

**Step 6: Super-admin verifies**
- In admin app, Verifier opens the verification queue, oldest first.
- Two-pane UI (see `admin-app.md` section A4):
  - Left: queue with tenant, amount, days pending.
  - Right: receipt image + expected amount + payer details + bank account expected.
- Match indicators auto-computed: amount match, reference present, account match.
- Verifier clicks **Approve** or **Reject** (with reason code + optional message).

**Step 7: Approve path**
- Payment proof → `verified`.
- Invoice → `paid`.
- Subscription extended by the plan period.
- PDF receipt generated and emailed to tenant.
- Tenant gets notification: "Payment verified."

**Step 8: Reject path**
- Payment proof → `rejected` with reason.
- Tenant gets notification with reason: "Your payment couldn't be verified: [reason]. Please review and resubmit."
- Invoice returns to `awaiting_payment`.
- Tenant can submit a new proof (new row, original kept for audit).

### 3.3 Grace period and suspension

| Days past due | Subscription status | Tenant access | Banner |
|---|---|---|---|
| 0 | active | full | none |
| 1–7 | grace_period | full | "Your subscription needs payment" + reminder |
| 8–30 | suspended | read-only (view, export, no transactions) | "Your subscription is suspended. Pay to resume." |
| 31–120 | cancelled | read-only export only | "Your subscription is cancelled. Export your data before [date]." |
| 121+ | archived | none | (data soft-deleted, hard-delete after 365 days) |

A successful payment at any stage before `archived` restores `active` status. After `archived`, tenant must contact support to restore.

### 3.4 Auto-renewal

- A background job runs daily, looks for subscriptions expiring in the next N days, and generates the next invoice.
- The tenant gets the same 7-day window to pay.
- No "automatic charge" because there is no payment method on file. This is deliberate.

### 3.5 Plan changes

- **Upgrade mid-cycle:** prorate. Generate a top-up invoice for the price difference × remaining days, due in 7 days. Upgrade takes effect immediately upon payment verification.
- **Downgrade mid-cycle:** takes effect at end of current billing period. No refund for the unused portion.
- Plan-change records stored in `subscription_changes` for audit.

---

## 4. POS Bank Transfer Flow (Customer Pays Tenant)

### 4.1 The decision: inventory commits regardless

When a customer pays by bank transfer at the POS, the cashier captures the receipt and completes the sale. The sale is marked `payment_pending`, but **stock decrements immediately** and the customer leaves with the goods.

**Why this trade-off:**
- The shop physically handed the goods over. The stock truly is gone.
- Holding the sale in limbo would corrupt inventory reporting.
- The unverified payment is an accounts-receivable problem, not a stock problem.
- The verification queue plus the dispute workflow handles bad outcomes.

This is the most important rule of the POS flow. Do not change it without explicit owner approval.

### 4.2 State machine for POS bank-transfer sales

```
   ┌────────────┐  bank_transfer  ┌──────────────────┐
   │  in_cart   │────────────────▶│ payment_pending  │
   └────────────┘                 └──────────────────┘
                                       │       │
                              verified │       │ rejected
                                       ▼       ▼
                                  ┌──────┐  ┌──────────┐
                                  │ paid │  │ disputed │
                                  └──────┘  └──────────┘
                                                │
                              resolve_paid /    │
                              write_off /       │
                              reopen            ▼
                                          ┌──────────┐
                                          │ resolved │
                                          │  states  │
                                          └──────────┘
```

### 4.3 Step-by-step UX

**Step 1: Checkout**
- Cashier rings up the sale.
- At payment screen, selects **Bank Transfer** tab.

**Step 2: Show payment details**
- POS displays a large QR code (256px square) encoding the receiving bank account + amount.
- Below: bank account text in both languages, copy-to-clipboard, "Print slip" option.
- Customer scans QR or copies details into their bank app.

**Step 3: Customer transfers**
- Off-platform. Customer makes the transfer at their bank.
- Shows the confirmation screen to the cashier or sends a screenshot.

**Step 4: Cashier captures receipt**
- Cashier taps "Customer has paid" → opens receipt capture sheet.
- Two paths:
  - **Photo:** snap or upload the customer's bank confirmation.
  - **Manual entry only:** if photo unavailable, enter bank reference number with explicit "no receipt photo" flag.
- Cashier enters: bank reference number, payer name (optional, defaults to attached customer if any), transfer date (defaults to today).
- "Complete sale" → sale committed.

**Step 5: Sale committed**
- Sale → `payment_pending`.
- Stock movements created (inventory decrements).
- Receipt printed/emailed/SMS'd to customer.
- `payment_proof` row created with `context = 'sale'`, status = `pending`.

**Step 6: Supervisor verifies**
- Branch supervisor or manager opens the POS verification queue in tenant app (`/sales/verification`).
- Same two-pane UI pattern as super-admin verification.
- Approves or rejects.

**Step 7a: Approve path**
- Payment proof → `verified`.
- Sale → `paid`.
- Customer gets notification: "Your payment was confirmed. Thank you."

**Step 7b: Reject path**
- Payment proof → `rejected`.
- Sale → `disputed`.
- Supervisor handles per shop policy:
  - Call customer to clarify.
  - Mark as paid manually (override, requires notes, audit-logged).
  - Write off (requires manager+, audit-logged).
  - Reopen for verification (if more proof provided).

### 4.4 Offline mode

When the POS is offline:
- Sale is captured locally with a client-generated UUID.
- Receipt photo queued in IndexedDB.
- Sale appears as `payment_pending` locally.
- On reconnect: sale syncs, receipt image uploads, `payment_proof` row created server-side.

### 4.5 Per-branch bank account routing

Each branch can:
- Use the tenant's default receiving account, OR
- Override with a branch-specific account (some shops want each branch's revenue going to its own account).

QR codes at the POS use the branch's account.

### 4.6 The "manual card" payment method (NOT bank transfer)

For tenants who have an external card terminal (POS device from their bank):
- Cashier selects **Manual Card** at payment.
- Processes on their physical terminal.
- Enters the terminal's approval code into the app.
- Sale → `paid` immediately. No verification needed.
- The platform trusts the terminal; risk is on the tenant.

This is **different** from bank transfer flow — no `payment_proof` row created.

---

## 5. Platform Bank Accounts (Our Side)

Configured in the admin app at `/banking/accounts`.

### 5.1 Schema

```sql
CREATE TABLE platform_bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name       JSONB NOT NULL,  -- { en, ar }
  account_holder  TEXT NOT NULL,
  account_number  TEXT NOT NULL,  -- masked in logs
  iban            TEXT,
  swift           TEXT,
  branch_address  TEXT,
  currency_code   CHAR(3) NOT NULL,
  country_code    CHAR(2) NOT NULL,
  is_default_for_currency BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID NOT NULL  -- platform_user_id
);

CREATE UNIQUE INDEX idx_platform_bank_default_per_currency
  ON platform_bank_accounts(currency_code)
  WHERE is_default_for_currency = true AND is_active = true;
```

### 5.2 Surfacing on invoice

When a tenant sees their invoice:
1. Filter platform bank accounts by tenant's currency.
2. If multiple, show all with the default first.
3. Show full details with copy buttons.
4. Show the reference code prominently.

### 5.3 Security

- Full account numbers visible only on invoice pages and admin app account detail.
- Logs and audit trails mask all but last 4 digits.
- No account numbers in error messages or stack traces.

---

## 6. Bank Statement Reconciliation (Phase 2)

A helper for verifiers to handle high volume.

### 6.1 Flow

1. Super-admin downloads CSV bank statement from one of the platform's bank accounts.
2. In admin app at `/banking/reconciliation`, uploads the CSV.
3. System parses (configurable per bank), normalizes columns: date, amount, currency, reference, payer.
4. Auto-matches against `pending` payment proofs by:
   - **Exact match** on reference code (highest confidence).
   - **Fuzzy match** on amount + date window + payer name similarity.
5. UI shows three sections:
   - **Auto-matched** (high confidence) — bulk approve button.
   - **Suggested matches** (medium confidence) — one-tap approve per row.
   - **Unmatched bank transactions** — for manual review (could indicate proof not yet submitted, or fraud).

### 6.2 Bank format support

The parser is rule-based, configured per bank by super-admins. Each bank config defines:
- Column positions or headers.
- Date format.
- Amount format (thousands separator, decimal).
- Reference field location.

Adding a new bank is a config change, not a code deploy.

---

## 7. Fraud and Edge Cases

### 7.1 Duplicate receipt submission

- A bank reference number can be used **once** per `payment_proof`.
- Server enforces uniqueness on `(tenant_id, transfer_reference)` for `context = 'subscription'`.
- For sales: warning if the same reference appears on multiple proofs, but doesn't block (legitimate use case: one customer paying for multiple sales in one transfer is rare but possible — handled via "linked sales" feature in Phase 2).

### 7.2 Receipt image tampering

- Out of scope to detect programmatically.
- Mitigation: bank statement reconciliation (section 6) — the real bank transaction must exist.
- A pattern of reconciliation mismatches from one tenant flags them for review.

### 7.3 Lost receipts

- Tenant can request a duplicate `payment_proof` PDF from billing history.
- For sales: customer can request from the shop, who can print from sale detail.

### 7.4 Wrong amount transferred

- If less than expected: verifier rejects with reason `wrong_amount`. Tenant either tops up (new proof) or accepts cancellation.
- If more than expected: verifier approves the smaller expected amount and creates a `tenant_credit` row for the difference, usable against next invoice.

### 7.5 Refunds on bank-transfer sales

- Refunds are recorded but **not auto-disbursed** by the platform.
- The shop refunds the customer through their bank manually.
- The system tracks: refund amount, reason, processed-by user, processed-at timestamp, and a "refund proof" image upload from the shop (optional).

---

## 8. Reports for Operators

Built into the admin app, these help platform finance staff manage cash flow and the verification queue.

### 8.1 Aging report

- Buckets: 0–24h, 1–3 days, 4–7 days, 8–14 days, 15+ days.
- Shows count and total amount of pending payment proofs per bucket per currency.
- Target: zero proofs > 48 hours.

### 8.2 Daily verifier summary email

Sent to all super-admins with Verifier role at 9am their local time:
- Pending verifications count and total.
- Oldest pending (days).
- Rejected yesterday (count + reasons summary).
- Approved yesterday (count + total revenue).

### 8.3 MRR dashboard (Phase 3)

- MRR / ARR with currency breakdown.
- Movement: new + expansion − contraction − churn.
- Trial conversion rate (signup → first paid invoice verified).
- Median time from invoice issue to verified payment.

---

## 9. Audit Trail

Every state change on every `payment_proof` writes to the appropriate audit log:
- Subscription proofs → `platform_audit_log`.
- Sale proofs → tenant `audit_log`.

Each entry captures: actor, IP, user agent, action (`submitted`, `verified`, `rejected`, `resubmitted`, `cancelled`), reason (if reject), notes, before/after snapshots of the proof row.

The audit log is append-only. Reversals are new entries, never edits.

---

## 10. Configuration Defaults

| Setting | Default | Where configured |
|---|---|---|
| Trial length | 14 days | Plan settings (super-admin) |
| Invoice due window | 7 days | Tenant-level setting (super-admin can override per tenant) |
| Grace period | 7 days | Plan-level |
| Suspension cutoff | 30 days past due | Plan-level |
| Cancellation cutoff | 120 days past due | Plan-level |
| Verification SLA target | 24 hours | Internal metric |
| Receipt retention | 7 years | System constant |
| Max upload size | 5 MB | System constant |

---

## 11. Reference

- Module location: `apps/api/src/shared/payment-proof/`
- Tenant UI: `/billing/*` and `/sales/verification`
- Admin UI: `/billing/verification` and `/banking/*`
- Audit logs: `audit_log` (tenant), `platform_audit_log` (super-admin)
- Companion documents: `PRD.md` 4.8, `admin-app.md`, `CLAUDE.md` Payments section
