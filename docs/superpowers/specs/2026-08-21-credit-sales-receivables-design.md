# Partial & deferred customer payments (credit sales / receivables)

## Context
Madar's POS currently settles every sale in full at sale time. The owner wants real-world SMB/wholesaler behavior: customer pays part now and the rest later, pays everything later, or just receives an invoice to pay later. Confirmed decisions:

- Scenarios: **partial now + rest later**, **full credit (pay all later)**, **invoice-only sale**. No scheduled-installment plans.
- Guardrails: unpaid balance requires a **named customer**; credit sales are **role-gated**. Per-customer credit limits deferred (schema leaves room).
- Settlement: later payments via **any method** (cash / bank transfer with proof / card), recorded from the customer detail screen against specific open sales.

## Approach
Extend the existing sale pipeline rather than building a separate AR module. A credit sale is a normal sale whose tender lines sum to **less than** `total_cents`; the shortfall becomes a receivable on the customer, tracked with the same append-only ledger discipline as store credit.

## Schema (`packages/db/prisma/schema.prisma` + migration + RLS)
1. `SalePaymentStatus` enum: add `partially_paid`, `unpaid`.
2. `Sale`: add `balance_due_cents BigInt @default(0)` (denormalized; source of truth is `total_cents - sum(sale_payments)` excluding rejected proofs). Index `[tenant_id, customer_id, payment_status]` for open-balance lookups.
3. New `CustomerReceivableLedger` → `customer_receivable_ledger`, mirroring `store_credit_ledger` (line ~1103): `customer_id`, signed `amount_minor`, `balance_after_minor`, `currency_code`, `reference_table` (`sale` | `sale_payment` | `manual_adjustment`), `reference_id`, `note_i18n`, `created_by`; `onDelete: Restrict`; append-only.
4. `Customer`: add denormalized `receivable_balance_minor BigInt @default(0)` + `receivable_currency_code Char(3)?` (same pattern as store credit).
5. RLS policies on the new table; `pnpm test:rls` extended.

## API (`apps/api/src/tenant`)
1. **Sale creation** (`sales/sales.service.ts`): relax the "payments must equal total" rule (~line 262 `normalizePayments`) — allow sum < total **only when** `customer_id` is present AND caller has the new `sales.credit` permission (role-gated; otherwise 403 `credit_sale_not_permitted`). Derive status: sum=0 → `unpaid`; 0<sum<total → `partially_paid`; existing `paid`/`payment_pending` logic unchanged (bank-transfer slice still forces `payment_pending`). Write receivable ledger row (+customer balance) inside the same transaction. Inventory commits regardless, as today.
2. **Settle endpoint**: `POST /customers/:id/receivable-payments` (new controller in `customers` or small `receivables` module): body = sale_id + one payment slice (reuse the payment-slice DTO/validation from sales). Creates a `sale_payments` row on that sale, bank transfer → existing `payment_proofs` flow (`context='sale'`), updates `balance_due_cents`/`payment_status`, writes a negative receivable ledger row, audit entry. Idempotency key required.
3. Proof rejection on a settlement payment reopens the balance (status back to `partially_paid`/`unpaid`) — same revert discipline as existing disputed flow.

## Web (`apps/web`)
1. **PaymentSheet** (`pos/_components/PaymentSheet.tsx`): add an "On account / آجل" amount line usable alone (full credit) or alongside tenders (partial). Selecting it requires a customer (opens existing `CustomerPickerModal`) and is hidden/disabled without the permission. Confirmation shows balance due prominently.
2. **Customer detail** (`customers/[id]/detail-client.tsx`): new **Balance** tab — outstanding total, list of open sales with balances, "Receive payment" action reusing the payment-method bodies (cash/card/bank-transfer-with-receipt-upload).
3. **Invoice-only**: full-credit sale prints/shares the existing receipt template labeled as invoice with balance due and bank details. No separate invoice entity.
4. Empty/loading/error states; EN+AR strings in `en.json`/`ar.json` (glossary: propose آجل / حساب العميل terms in `docs/i18n-glossary.md`); logical CSS; tokens.

## Docs & tasks
- Update `docs/billing-flow.md` (new "Credit sales & receivables" section), `docs/PAGES.md` (#35 Balance tab, PaymentSheet spec), `docs/i18n-glossary.md`, and tick/add items in `tasks.md`.
- New ADR `docs/0007-customer-receivables.md` (ledger-mirroring decision, no separate AR module).

## Testing
- Unit/integration: partial sale, full-credit sale, permission denial, settlement across each method, proof-rejection reopen, ledger/balance consistency (mirror `apps/api/test/store-credit/store-credit.spec.ts` and `sales/payment-split.spec.ts`).
- `pnpm test:rls` with the new table/endpoints; e2e credit-sale + settle flow EN+AR; `pnpm i18n:check`.

## Out of scope (explicit)
Credit limits, installment schedules, due dates/reminders, statements/aging reports, multi-sale payment allocation.
