# Quotations (عرض سعر) — saved quotes + quick print

## Context
Walk-in buyers often ask for a priced document without buying: "give me an invoice/receipt for these items, I'll decide later." Madar has nothing for this — held sales are internal 24h cart parking, and receipts require a completed sale. Owner confirmed BOTH forms: (A) a **saved quotation** with its own `QT-XXXXXX` number, snapshotted prices, a validity period, listed in the app, convertible to a real sale in one tap; (B) a **quick print** of the current cart as an estimate, nothing saved. No inventory movement, no payment, until conversion. Work continues on branch `feat/receivables-credit-sales` in the worktree `C:\Users\mubar\Desktop\madar-receivables`.

## Key decisions
- **Separate tables** `quotations`/`quotation_lines` (not overloading `held_sales` — different lifecycle: numbered, long-lived, customer-facing). Lines snapshot `name_i18n`/`sku` so the document renders even after product rename/delete.
- **Quoted prices honored on convert** — server-side: `CreateSaleInput` gains `quotation_id`; `completeSale` prices matching lines from the quotation row (client never sends prices — ADR 0005's spirit preserved; new ADR documents the bounded exception). Expired quotes can't convert at quoted prices — UI offers "Reprice & sell" (plain hydration, no quotation_id).
- **Validity**: default 14 days, per-quote 1–90; expiry derived from `valid_until` at read time (`effective_status`), no cron, no stored expired status. Status enum: `open | converted | cancelled`.
- **Conversion UX**: Quotations list/detail → Convert → POS opens with cart hydrated at quoted prices + a quote-mode banner → normal PaymentSheet (any tender incl. on-account) → sale created, quote stamped `converted` + `converted_sale_id` in the same transaction.
- **Quick print**: built entirely client-side from the cart; labeled "Quotation — not a tax invoice / عرض سعر — ليست فاتورة ضريبية" with valid-until; includes bank details; no fake number.
- Roles: any POS role creates/prints quotes (cashiers own-only, owner/manager branch-wide — held-sales `assertCanAccess` pattern).

## Tasks (executor: subagent-driven, same discipline as the receivables plan)

### 1. Schema + RLS
`packages/db/prisma/schema.prisma`: enum `QuotationStatus { open, converted, cancelled }`; model `Quotation` (tenant/branch/cashier/customer?, `code` unique per tenant, note, status, subtotal/discount/tax/total cents BigInt, currency, `valid_until`, `converted_sale_id?`, `converted_at?`, `cancelled_at?`, audit + soft-delete cols; indexes `[tenant,branch,status,created_at desc]`, `[tenant,customer]`) and `QuotationLine` (quotation cascade, product_id, **`name_i18n` Json + `sku?` snapshots**, qty, unit_price_cents, discount_cents, note). Migration + hand-appended RLS for both tables (copy `20260630182842_fixed_assets` block style; no append-only guard — quotes mutate). Gate: `db:migrate`, `typecheck`, `test:rls`.

### 2. Quotations API module
`apps/api/src/tenant/quotations/` cloned from `held-sales` module (controller/service/DTOs, `withTenantTx`, `buildCtx`, RateLimit, `@Idempotent()` create):
- `POST /v1/quotations` — held-sale-create body + `valid_days` (int 1–90 default 14); server snapshots name/sku from catalog, sets `valid_until`, generates `QT-` code (clone `generateSaleCode` + unique-retry loop).
- `GET /v1/quotations` (branch/status/page filters; summary includes `effective_status` = "expired" when open & past valid_until; NO 24h window), `GET /v1/quotations/:id` (renders from snapshots, no product join), `POST /v1/quotations/:id/cancel`.
- Export `getOpenForConvert(tenantId, id)` → throws `quotation_not_found` 404 / `quotation_not_open` 409 / `quotation_expired` 409.
- Audit: `quotation_created`, `quotation_cancelled`. Tests: code format/uniqueness, expired derivation, cancel idempotency, cashier-vs-manager access, currency/tenant isolation.

### 3. Conversion in sales service
`create-sale.dto.ts`: `quotation_id: UuidSchema.optional()` (reject when combined with `offline_completed`). `sales.service.ts completeSale`: after product load, if quotation_id → `getOpenForConvert`, currency must match (`quotation_currency_mismatch` 400), build product→quoted-price map; per-line `unitPrice = quoted ?? product.price_cents` (offline branch precedence unchanged); inside the sale tx, `updateMany({ where: { id, status: "open" }, data: { status: "converted", converted_sale_id, converted_at } })` — count 0 → `quotation_not_open` (race-safe). client_uuid idempotency replay check stays BEFORE quote validation. Audit: sale payload gains quotation_id + `quotation_converted` row. Tests: quoted price survives catalog price change; double-convert 409 but same-client_uuid replay returns original sale; expired 409 no side effects; non-quote lines price from catalog; works with `on_account_cents`.

### 4. POS — Save Quote + quote-mode cart
`apps/web/src/lib/api/quotations.ts` (fetchers mirroring `held-sales.ts`). `pos-client.tsx`: `SaveQuoteModal` (validity days, note; builds lines like `holdCurrent` ~L390; toast with code + View/Print; clears cart); `hydrateCartFromQuotation` sibling of `hydrateCartFromPayload` ~L359 (drop-missing-products, discount% from cents) setting `CartLine.unitPriceOverrideCents` + `quoteContext {id, code}`; POS `?quote=<id>` (and `&reprice=1` → hydrate without overrides) param; cart banner "Converting quotation {code}" with exit; totals use override price; CreateSale body spreads `quotation_id`. Strings `pos.quote.*` EN+AR.

### 5. Quotations list + detail pages
`(shell)/sales/quotations/` list (copy sales-client structure: code/customer/total/valid-until/status badge, filter, CLAUDE.md empty state) + `[id]` detail (snapshot lines, actions: Convert→`/pos?quote=id` when open, Reprice & sell when expired, Print, Cancel with confirm; converted → link to sale). Nav link under Sales. Tokens/logical CSS/EN+AR.

### 6. Print — ReceiptView refactor + quote docs
Extract presentational `ReceiptView` from `receipt-doc.tsx` (wrapper keeps query + cash-drawer logic); add `variant: "receipt" | "quotation"` (quotation: QT code, not-a-tax-invoice title, valid-until row, no tender/stamp, bank details always when available). Saved-quote print page (chrome-free route mirroring `sales/[id]/receipt` placement); source legal fields (`legal_name`, `tax_registration_number`) from the existing business-profile endpoint — extend it if missing rather than adding a new endpoint. Quick print: POS action renders `ReceiptView` from cart data in a print-only portal (code "—", valid-until +14d) → `window.print()`. Verify sale receipt unchanged (visual check), 58mm/80mm/A4, EN+AR.

### 7. E2E
Playwright `quotation.spec.ts` EN+AR: cart → save quote → list open → detail → convert → banner → cash sale → quote converted linking to sale; plus cancel + expired-badge spec. (Repo still has no harness — spec grounded against real component markup, execution deferred like credit-sale.spec.ts.) Full gate: lint, typecheck, test, test:rls, i18n:check.

### 8. Docs
`docs/PAGES.md` (POS quote action + quick print; quotations pages), `docs/PRD.md` note, `docs/i18n-glossary.md` (عرض سعر، صالح حتى، تحويل إلى بيع), ADR `docs/0008-quotation-price-snapshot.md` (check next free number), `tasks.md` tick.

## Reuse map
- `held-sales.service.ts` / controller — module template (FK checks, withTenantTx, assertCanAccess, toPayload)
- `generateSaleCode` (sales.service.ts ~1233) → `generateQuotationCode` with `QT-` prefix + retry loop (~377)
- `holdCurrent` / `hydrateCartFromPayload` (pos-client.tsx ~359-428) — line building + hydration
- `receipt-doc.tsx` + `receipt.css` — document rendering; `receiptDataRequest` shape as the doc-data contract

## Risks
- receipt.css shared across routes — watch class collisions with pos.css.
- Idempotency ordering in Task 3 (replay before quote-state check).
- Print route placement must be chrome-free — mirror how `sales/[id]/receipt` sits outside `(shell)`.

## Verification
Per-task gates as listed; end-to-end manual browser run (same style as the receivables demo): save a quote at POS, change the product's catalog price, convert the quote, confirm the sale used the quoted price and the quote shows Converted; print preview A4 + 80mm in EN and AR; quick-print an unsaved estimate.
