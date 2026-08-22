# 0007 — Customer receivables mirror the store-credit ledger; no separate AR module

**Status:** adopted (2026-08-21)

## Context

The owner wanted real-world SMB/wholesaler credit behavior: a customer pays
part now and the rest later, pays nothing now and everything later, or just
receives an invoice to pay later. Three options were on the table:

1. Build a dedicated accounts-receivable module — its own `invoices` /
   `receivables` domain, independent of `sales`.
2. Treat an underpayment implicitly — a sale whose tendered `payments[]`
   don't sum to `total_cents` silently becomes a credit sale for the
   shortfall.
3. Extend the existing sale pipeline with an **explicit** `on_account_cents`
   field, and track the resulting balance with the same append-only ledger
   pattern already proven by `store_credit_ledger`.

## Decision

Option 3. A credit sale is a normal `sales` row whose `payments[]` sum plus
an explicit `on_account_cents` equal `total_cents` — never an implicit
underpayment. `on_account_cents` must be present and non-zero for any credit
to be extended; a sale that doesn't balance to the total is rejected
outright, so the API never has to guess whether a short payment was
deliberate credit or client error.

The resulting balance is tracked in a new `customer_receivable_ledger`
table that mirrors `store_credit_ledger` line-for-line: append-only, signed
`amount_minor`, running `balance_after_minor`, `currency_code`, a
`reference_table`/`reference_id` pointer, `note_i18n`, `created_by`. The
denormalized cache (`customers.receivable_balance_minor` +
`receivable_currency_code`) is updated only inside the same transaction as a
ledger write, never independently — the same discipline `CLAUDE.md` already
mandates for `branch_stock.qty_on_hand` vs. `stock_movements`.

No new `invoices` entity was introduced. A fully-credit sale's existing
receipt template doubles as the invoice (an "Invoice · balance due" banner +
bank details whenever `balance_due_cents > 0`); settlement reuses the
existing sale-payment slice validation and the existing `payment_proofs`
module (`context: 'sale'`) for bank-transfer receipts, including the same
"inventory/payment commits now, verification happens later" posture as the
POS bank-transfer flow (`docs/billing-flow.md` §4.1).

## Consequences

- **Ledger discipline is uniform.** Anyone auditing store credit already
  knows how to audit receivables — same append-only guarantee, same
  denormalized-cache-never-mutated-alone rule, same revert-by-reversing-row
  pattern (a rejected settlement proof writes a reversing positive ledger
  row rather than editing the original negative one).
- **No parallel invoice numbering, invoice status machine, or invoice CRUD
  surface to build and keep in sync with sales.** The trade-off: an
  "invoice" is not a first-class, independently addressable document — it is
  always a view of a sale. If the product later needs invoice-specific
  behavior (custom numbering series, PDF templates distinct from receipts,
  invoices with no linked sale), that is a new ADR superseding this one.
- **Settlement is one payment against one sale per call.** There is no
  multi-sale payment allocation (`docs/billing-flow.md` §4A.3). A customer
  with several open sales must be settled with separate calls. Deliberately
  deferred, not designed around — the schema does not preclude adding
  allocation later, but nothing in the current shape assumes it.
- **Explicit over implicit.** Choosing option 3 over option 2 means every
  credit sale is unambiguous at creation time (role-gated, requires a named
  customer, requires the caller to state the credit amount) rather than
  inferred from a short tender. This trades a slightly larger request
  payload (`on_account_cents`) for eliminating a whole class of "was this
  underpayment a bug or a credit sale?" ambiguity.
- **Explicitly out of scope**, left for a future ADR/spec if the product
  needs them: per-customer credit limits (schema leaves room — no column,
  no enforcement), installment schedules, due dates/reminders, statements or
  aging reports.
