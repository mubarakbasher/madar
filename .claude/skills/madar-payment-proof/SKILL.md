---
name: madar-payment-proof
description: Walk through Madar's bank-transfer payment-proof flow — the load-bearing differentiator. Use whenever a task touches sale completion, subscription verification, the verification queue, receipt upload, or the payment_proofs table. Encodes the shared module that powers BOTH in-store sales (cashier-supervisor verifies) and subscription billing (admin Finance/Verifier role verifies).
---

# madar-payment-proof

There is **no payment gateway** in Madar. Both subscription billing (tenants paying us) and in-store POS payments (customers paying tenants) use the same pattern: **bank transfer + uploaded proof + manual verification**. Build this as one shared module, not two parallel implementations.

## The table

```prisma
model PaymentProof {
  id                String   @id @default(uuid())
  tenant_id         String   // nullable for context='subscription'? No — subscriptions are tenant-scoped too. Always set.
  context           String   // 'subscription' | 'sale'
  reference_id      String   // sale_id or subscription_invoice_id
  amount_cents      BigInt   // money as integer cents
  currency_code     String   // ISO 4217
  bank_account_id   String   // which bank account the payer transferred to
  payer_name        String
  payer_bank        String?
  transfer_date     DateTime
  transfer_reference String  // bank ref number entered by payer
  receipt_image_url String   // signed S3 URL — never public
  status            String   // 'pending' | 'verified' | 'rejected' | 'cancelled'
  verified_by       String?  // user_id (tenant manager) OR platform_user_id (super-admin)
  verified_at       DateTime?
  rejection_reason  String?
  notes             String?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  // Tenant-scoped: RLS applies normally
}
```

The same table backs both flows. Discriminate by `context`.

## State machine

```
                  ┌──────────────┐
            ┌────▶│   pending    │◀────────────────┐
            │     └──────┬───────┘                 │
            │            │                          │ resubmit
            │            ▼                          │
            │   ┌──────────────────┐                │
            │   │ verifier reviews │                │
            │   └──────────────────┘                │
            │            │                          │
            │   approve  │   reject                 │
            │            ▼                          │
            │   ┌──────────────┐        ┌──────────────┐
            └──▶│   verified   │        │   rejected   │──┐
                └──────────────┘        └──────────────┘  │
                                                          │
                                        cancelled ◀───────┘
```

- `pending → verified` — verifier approves.
- `pending → rejected` — verifier rejects with reason. Payer can resubmit a corrected proof, creating a new `pending` row.
- `pending → cancelled` — payer withdraws (e.g., sale voided, invoice cancelled).
- **No edits on verified/rejected rows ever.** Reversing a decision requires a manager override that creates a NEW row and writes a new audit entry. The original is immutable.

## Routing the verifier UI

| context | Verifier | App | Auth | Audit log |
|---|---|---|---|---|
| `subscription` | Super-admin (Finance/Verifier role) | `apps/admin` | `AdminAuthGuard` + role check | `platform_audit_log` |
| `sale` | Branch supervisor / manager | `apps/web` | `TenantAuthGuard` + role check | tenant `audit_log` |

The same React component (`<VerificationQueue context="…" />`) can render both — only the data source and audit-log target differ.

## In-store sales (POS) flow

1. Cashier rings up sale, selects "Bank Transfer" at checkout.
2. POS displays QR (`qrcode.react`) with the tenant's receiving bank account + amount.
3. Customer transfers; shows bank confirmation or screenshot.
4. Cashier uploads receipt photo OR enters bank reference manually.
5. **Sale state: `payment_pending`. Inventory still decrements** — goods left the shop. The stock movement happens regardless of payment verification.
6. Branch supervisor sees pending sales in the tenant verification queue, opens the receipt, approves or rejects.
7. `approve` → sale `paid`. `reject` → sale `disputed`, supervisor handles per shop policy (refund, chase customer, write off).

## Subscription billing flow

1. Tenant trial ends → invoice generated with platform bank account details + reference code.
2. Tenant transfers, uploads receipt, enters payer name + transfer date + bank ref.
3. Subscription invoice → `payment_submitted`. Tenant **retains full access** during review.
4. Super-admin Finance/Verifier opens the verification queue in `apps/admin`, sees the receipt next to the expected amount.
5. `approve` → subscription extends, status `active`, PDF receipt generated, email sent.
6. `reject` → tenant notified with reason, prompted to resubmit. 7-day grace from original due date.

## Receipt image handling

- **Max 5 MB.** Reject larger.
- **Accepted:** JPG, PNG, PDF only.
- **Server-side pipeline (BullMQ job, do not block the upload response):**
  1. Resize: 2000px on long edge
  2. Strip EXIF (privacy — receipts often have GPS in the photo)
  3. Virus scan with ClamAV — if infected, mark proof `rejected` with system reason
  4. Store at `tenants/{tenant_id}/payment-proofs/{proof_id}.{ext}` in S3-compatible storage
  5. Generate signed URL on demand; **never public**
- **Retention:** 7 years (audit / tax). Implement as a soft delete with `deleted_at`; physical purge is a separate scheduled job.

## Bank account masking

In **logs, audit entries, error messages** — only show the last 4 digits of an account number. Per `CLAUDE.md`: "Show full bank account numbers in logs or audit trails — mask to last 4."

```typescript
const masked = `••••${account.number.slice(-4)}`;
```

In the **verifier UI**, the full number can be revealed by an explicit "Reveal" button that itself emits an audit entry.

## Daily verifier hygiene

- **Daily summary email** to super-admin Finance role: pending count, total amount, oldest pending age.
- **Aging report** page: payment_proofs sorted by `created_at`, color-coded by age (green <24h, amber 24–72h, rose >72h).
- **Bank statement import (Phase 2):** CSV upload, fuzzy-match by amount + reference + date to suggest approvals.

## Keyboard shortcuts on the verification queue

Per `CLAUDE.md` admin spec (page A4 of super-admin):
- `J` / `K` — next / previous proof
- `A` — approve
- `R` — reject (opens reason input)
- `E` — request more info

Implement these in the admin verification queue as well — they make a queue of 50+ proofs/day tractable.

## What MUST be audited

Every state transition writes one audit entry to the right log:
- `subscription` context → `platform_audit_log` with actor = super-admin
- `sale` context → tenant `audit_log` with actor = tenant user

For impersonation: writes to **both** logs.

Fields per audit entry: `actor_id`, `actor_type`, `ip`, `user_agent`, `action` (`payment_proof.submitted` / `.verified` / `.rejected` / `.cancelled`), `target_id` (proof id), `before_json`, `after_json`.

## Edge cases

- **Partial verification** — not supported. A proof is verified entirely or not at all. If the customer over/under-paid, the verifier rejects with reason and the cashier resolves out-of-band.
- **Multi-currency** — the proof's `currency_code` MUST match the sale/invoice's currency. Reject mismatches.
- **Network failure during upload** — receipt upload is queued client-side (PWA + IndexedDB) and retried on reconnect. Sale completion does NOT block on upload completion; the proof can land minutes later and be matched.
- **Same receipt for two transactions** — the system warns on duplicate `transfer_reference` but does not block. Verifier decides.

## What NOT to do

- ❌ Integrate Stripe, Paymob, Tap, or any gateway. The bank-transfer model IS the business model.
- ❌ Auto-approve proofs by any heuristic. Verification is always human, per `CLAUDE.md`.
- ❌ Block inventory updates on payment verification. They are independent state machines.
- ❌ Edit `verified` or `rejected` proofs. Override requires a NEW row.
- ❌ Log full bank account numbers. Mask to last 4.
- ❌ Build two separate UIs for subscription vs sale verification. One component, two data sources.
- ❌ Display the receipt image in a public-accessible URL. Always signed URLs from the API.
