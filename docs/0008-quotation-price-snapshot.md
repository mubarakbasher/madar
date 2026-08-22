# ADR 0008 — Quotation price snapshot honored on conversion

**Status:** adopted (2026-08-22) · **Relates to:** ADR 0005 (offline sync validation), `docs/superpowers/plans/2026-08-22-quotations.md`

## Context

ADR 0005 §2 established that **online sales always price from the live
catalog** — a client-supplied `unit_price_cents` is only ever honored for
`offline_completed=true` sales, and even then it is logged as a
`price_drift` conflict, never trusted outright. This is a deliberate
anti-tampering rule: a cashier terminal (or a compromised client) must never
be able to dictate what a sale is priced at.

Quotations break the "always reprice from catalog" default on purpose: the
whole point of saving a quote is that the customer is promised those exact
numbers until `valid_until`, even if the catalog price moves in the
meantime. Converting a quote at a different price than what was quoted would
make the feature pointless.

## Decision

Quoted prices are honored on conversion, but **the client never supplies
them** — the exception is bounded entirely to a server-side lookup:

1. `CreateSaleInput` gains an optional `quotation_id`. The client sends only
   an id; it never sends `unit_price_cents` for quoted lines (that field is
   ignored/absent on the quote-conversion path).
2. `completeSale` resolves `quotation_id` server-side via
   `getOpenForConvert(tenantId, id)`, which re-reads the quotation's own
   `quotation_lines` rows (themselves snapshotted at save time from the
   catalog, not writable by the client) and throws `quotation_not_found`
   (404), `quotation_not_open` (409), or `quotation_expired` (409) before
   any pricing happens.
3. Per sale line, `unitPrice = quotedPrice(product_id) ?? product.price_cents`
   — a quoted line prices at its snapshot, any line not on the quotation
   prices from the live catalog as normal. The offline `offline_completed`
   drift-priced branch (ADR 0005) takes precedence when both are somehow
   present; the two paths are mutually exclusive in practice
   (`quotation_id` + `offline_completed` together is rejected at the DTO).
4. Currency must match the quotation (`quotation_currency_mismatch` 400) —
   no cross-currency reprice.
5. **Expired quotations cannot convert at quoted prices.** `getOpenForConvert`
   rejects with `quotation_expired` for a quote past `valid_until`; the only
   UI path forward is "Reprice & sell", which hydrates the same lines with
   no `quotation_id` and no override — a plain sale priced entirely from the
   live catalog, same as any other cart.
6. The quotation row transitions `open -> converted` inside the same
   transaction as the sale (`status = 'open'` guard in the `UPDATE`, count 0
   -> `quotation_not_open`), so a race between two convert attempts (or a
   cancel racing a convert) can never leave both a converted sale and a
   still-open quotation.

## Consequences

- This is a narrow, explicit exception to ADR 0005's "online sales always
  price from catalog" rule, not a reopening of it — it only fires when a
  `quotation_id` resolves to a currently-open, unexpired quotation owned by
  the same tenant, and the price comes from a row the client cannot write to
  directly (quotation creation itself always snapshots from the catalog at
  save time, never from client-supplied prices).
- Any future "quote-like" feature (e.g. a supplier-facing price hold) that
  wants the same pattern should re-derive it from this ADR rather than
  loosening ADR 0005 generally.
- If quoted-price honoring needs to extend to expired quotes (e.g. a
  manager override), that is a new decision superseding point 5 above, not
  a silent code change.
