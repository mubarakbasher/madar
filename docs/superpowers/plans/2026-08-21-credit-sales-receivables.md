# Credit Sales & Customer Receivables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a POS sale be completed with part or all of the total left owing on a named customer's account ("on account" / آجل), tracked in an append-only receivable ledger, and settled later from the customer detail screen via any payment method.

**Architecture:** A credit sale is a normal sale whose tender slices sum to less than `total_cents`; the shortfall is declared explicitly as `on_account_cents` and becomes a receivable on the customer, mirroring the existing `store_credit_ledger` pattern (append-only ledger + denormalized balance on `customers`, FOR-UPDATE row lock via `basePrisma.$transaction` + `SET LOCAL app.current_tenant_id`). Settlement creates additional `sale_payments` rows on the original sale through a new `receivables` tenant module. Invoice-only sales are the zero-tender case reusing the existing receipt endpoint.

**Tech Stack:** NestJS + Prisma + PostgreSQL 16 RLS (apps/api), Next.js 14 + next-intl (apps/web), zod DTOs, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-credit-sales-receivables-design.md`

## Global Constraints

- Multi-tenancy: every new table gets `tenant_id` + the canonical `tenant_isolation` (madar_app, NULLIF GUC) and `admin_full_access` (madar_admin) RLS policies, ENABLE + FORCE (copy the block style from `packages/db/prisma/migrations/20260630182842_fixed_assets/migration.sql`). `pnpm test:rls` must pass.
- Money is integer minor units in `BigInt` + sibling `currency_code CHAR(3)`. Never floats.
- Ledgers are append-only; denormalized balances (`customers.receivable_balance_minor`, `sales.balance_due_cents`) are caches updated in the same transaction as the ledger row.
- Every mutation writes to the tenant `audit_log` via `AuditService.writeTenantScoped` (non-fatal catch, mirroring `sales.service.ts:679`).
- No hardcoded user-facing strings — all copy in `apps/web/messages/en.json` + `ar.json`; `pnpm i18n:check` passes. Logical CSS only (`marginInlineStart`, etc.). Design tokens only.
- Role gate: only `owner` and `manager` may complete a credit sale or record a settlement; `accountant` may read. (TenantUserRole has no separate supervisor role.)
- Idempotency keys on resource-creating POSTs (`@Idempotent()` + `IdempotencyInterceptor`, as in `store-credit.controller.ts:48-52`).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Update `tasks.md` in the final task (CLAUDE.md contract).

---

### Task 1: Schema — enums, receivable ledger, balance columns, RLS

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_customer_receivables/migration.sql` (generated via `pnpm db:migrate`)

**Interfaces:**
- Produces: Prisma models `CustomerReceivableLedger` (table `customer_receivable_ledger`), `Customer.receivable_balance_minor` / `receivable_currency_code`, `Sale.balance_due_cents`, enum values `SalePaymentStatus.partially_paid|unpaid`, enum `ReceivableReference { sale, sale_payment, manual_adjust }`.

- [ ] **Step 1: Edit schema.prisma**

Add to `enum SalePaymentStatus` (line ~65): `partially_paid` and `unpaid`.

Add to `enum PaymentMethod` (line ~57): `on_account` — the derived `sales.payment_method` for a full-credit sale with no tender slices (Task 2 relies on it).

Add after `enum StoreCreditReference` (line ~142):

```prisma
enum ReceivableReference {
  sale
  sale_payment
  manual_adjust
}
```

In `model Customer` (line ~438), after `store_credit_currency_code`:

```prisma
  receivable_balance_minor    BigInt    @default(0)
  receivable_currency_code    String?   @db.Char(3)
```
and add relation line `receivable_ledger CustomerReceivableLedger[]` next to `store_credit_ledger`.

In `model Sale` (line ~644), after `total_cents`:

```prisma
  balance_due_cents   BigInt            @default(0)
```
and add index `@@index([tenant_id, customer_id, payment_status])`.

Add new model after `StoreCreditLedger` (line ~1118):

```prisma
model CustomerReceivableLedger {
  id                  String              @id @default(uuid()) @db.Uuid
  tenant_id           String              @db.Uuid
  customer_id         String              @db.Uuid
  amount_minor        BigInt
  balance_after_minor BigInt
  currency_code       String              @db.Char(3)
  reference_table     ReceivableReference
  reference_id        String?             @db.Uuid
  note_i18n           Json?
  created_by          String?             @db.Uuid
  created_at          DateTime            @default(now()) @db.Timestamptz

  // Restrict: a hard customer delete must never erase financial history.
  customer Customer @relation(fields: [customer_id], references: [id], onDelete: Restrict)

  @@index([tenant_id, customer_id, created_at(sort: Desc)])
  @@index([tenant_id, reference_table, reference_id])
  @@map("customer_receivable_ledger")
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:migrate -- --name customer_receivables` (or the repo's equivalent `prisma migrate dev --name customer_receivables` inside `packages/db`).

- [ ] **Step 3: Append hand-written SQL to the generated migration**

Open the new `migration.sql` and append (matching `20260630182842_fixed_assets/migration.sql` conventions):

```sql
-- RLS — role-scoped (ADR 0004).
ALTER TABLE "customer_receivable_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_receivable_ledger" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "customer_receivable_ledger"
  FOR ALL TO madar_app
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE POLICY admin_full_access ON "customer_receivable_ledger"
  FOR ALL TO madar_admin
  USING (true)
  WITH CHECK (true);

-- Append-only guard: this ledger never updates or deletes.
CREATE POLICY no_update ON "customer_receivable_ledger" AS RESTRICTIVE
  FOR UPDATE TO madar_app USING (false);
CREATE POLICY no_delete ON "customer_receivable_ledger" AS RESTRICTIVE
  FOR DELETE TO madar_app USING (false);
```

(If the init migration's append-only guard for `store_credit_ledger` uses a different mechanism — check `grep -r "store_credit_ledger" packages/db/prisma/migrations/20260521000000_pos_completeness/migration.sql` — copy THAT mechanism instead for consistency.)

- [ ] **Step 4: Apply + verify**

Run: `pnpm db:migrate` then `pnpm --filter @madar/db exec prisma validate` (or `pnpm typecheck`).
Expected: migration applies cleanly; schema valid.

- [ ] **Step 5: Run RLS suite**

Run: `pnpm test:rls`
Expected: PASS (new table has both policies; existing tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma
git commit -m "feat(db): customer receivable ledger + credit-sale payment statuses"
```

---

### Task 2: Sale creation accepts `on_account_cents` (API)

**Files:**
- Modify: `apps/api/src/tenant/sales/dto/create-sale.dto.ts`
- Modify: `apps/api/src/tenant/sales/sales.service.ts`
- Test: `apps/api/test/sales/create-sale.on-account.spec.ts` (new; mirror the harness in `apps/api/test/sales/payment-split.spec.ts`)

**Interfaces:**
- Consumes: Task 1 schema.
- Produces: `CreateSaleInput.on_account_cents?: bigint`; sales with `payment_status ∈ {unpaid, partially_paid}`, `balance_due_cents` set, a `customer_receivable_ledger` row (`reference_table: "sale"`, `reference_id: sale.id`, positive `amount_minor`), and `customers.receivable_balance_minor` incremented. `SaleResponse` gains `balance_due_cents: string`. Error codes: `credit_requires_customer` (400), `credit_sale_not_permitted` (403), `split_total_mismatch` now checks `sum(payments) + on_account === total`, `currency_mismatch` (400) when the customer's receivable currency differs.

- [ ] **Step 1: Write failing tests** in `create-sale.on-account.spec.ts` (copy the setup/teardown from `payment-split.spec.ts` — seeded tenant, branch, product, customer, owner + cashier principals):

```ts
it("completes a partial-payment sale: cash slice + on_account", async () => {
  // total 10000; pay 4000 cash, 6000 on account (owner principal, customer attached)
  const res = await completeSale({ payments: [{ method: "cash", amount_cents: 4000, cash_tendered_cents: 4000 }], on_account_cents: 6000, customer_id });
  expect(res.payment_status).toBe("partially_paid");
  expect(res.balance_due_cents).toBe("6000");
  const ledger = await scoped.customerReceivableLedger.findMany({ where: { customer_id } });
  expect(ledger).toHaveLength(1);
  expect(ledger[0].amount_minor).toBe(6000n);
  expect(ledger[0].balance_after_minor).toBe(6000n);
  const cust = await scoped.customer.findUnique({ where: { id: customer_id } });
  expect(cust!.receivable_balance_minor).toBe(6000n);
});

it("completes a full-credit sale: no payments, all on account → unpaid", ...);   // status "unpaid", balance_due == total, sale_payments empty
it("rejects on_account without a customer → 400 credit_requires_customer", ...);
it("rejects on_account from a cashier → 403 credit_sale_not_permitted", ...);
it("rejects when payments + on_account != total → 400 split_total_mismatch", ...);
it("rejects currency mismatch with existing receivable currency → 400 currency_mismatch", ...);
it("still commits inventory on a full-credit sale", ...);                        // stock_movements row exists, qty decremented
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter api test -- create-sale.on-account`
Expected: FAIL (`on_account_cents` unknown / stripped by zod).

- [ ] **Step 3: Implement DTO change** in `create-sale.dto.ts` — add to `CreateSaleSchema` object (after `payments`):

```ts
    // Credit sale: minor units left owing on the customer's account.
    on_account_cents: BigIntable.optional(),
```

and in `.superRefine`, allow the payments-absent case when on_account covers the sale:

```ts
    if (!data.payments && !data.payment_method && !data.on_account_cents) { /* existing issue */ }
```
(i.e. change the first guard's condition so a full-credit sale may omit both `payments` and `payment_method`.)

- [ ] **Step 4: Implement service change** in `sales.service.ts`:

a. Replace the sum check (lines 262-269):

```ts
    const payments = input.on_account_cents != null && !input.payments && !input.payment_method
      ? []                                      // full-credit sale: no tender slices
      : normalizePayments(input, totalCents);
    const onAccountCents = input.on_account_cents ?? 0n;
    const sumCents = payments.reduce((acc, p) => acc + p.amount_cents, 0n);
    if (sumCents + onAccountCents !== totalCents) {
      throw new BadRequestException({
        code: "split_total_mismatch",
        message: `Payments (${sumCents}) + on_account (${onAccountCents}) does not equal total (${totalCents})`,
      });
    }
    if (onAccountCents < 0n) {
      throw new BadRequestException({ code: "invalid_payment_amount", message: "on_account_cents must be non-negative" });
    }
    if (onAccountCents > 0n) {
      if (!input.customer_id) {
        throw new BadRequestException({
          code: "credit_requires_customer",
          message: "A customer must be attached to sell on account",
        });
      }
      // Role gate: the DB-read `actor` from the branch check above (line ~106)
      // is authoritative. Owners are branch-agnostic; managers qualify too.
      if (actor?.role !== "owner" && actor?.role !== "manager") {
        throw new ForbiddenException({
          code: "credit_sale_not_permitted",
          message: "Only owners and managers can complete credit sales",
        });
      }
    }
```
(Note: `actor` is currently only loaded inside the non-owner branch-auth path — hoist the `scoped.user.findUnique` at line 106 so `actor` is always available; owners currently skip nothing since the query runs unconditionally already. Verify and keep one query.)

b. Status derivation (replace line 311):

```ts
    const derivedStatus: "paid" | "payment_pending" | "partially_paid" | "unpaid" =
      onAccountCents > 0n
        ? (payments.length === 0 ? "unpaid" : "partially_paid")
        : anyBankTransfer ? "payment_pending" : "paid";
    const derivedMethod = payments.length >= 2 ? "split" : (payments[0]?.method ?? "cash");
```
(Full-credit sale has no slices; store `payment_method: "cash"` is wrong — instead make `derivedMethod` fall back to `"split"`? Neither fits. Decision: keep the `PaymentMethod` enum untouched and use `payments[0]?.method ?? "bank_transfer"`? Also wrong. Correct approach: `payment_method` is NOT NULL, so add enum value — **add `on_account` to `enum PaymentMethod` in Task 1** and use here: `payments.length >= 2 ? "split" : payments.length === 1 ? payments[0]!.method : "on_account"`. Task 1 implementer: include `on_account` in the `PaymentMethod` enum; it is a valid derived method for full-credit sales and appears in list filters.)

c. Inside the transaction, after the store-credit/payment-slice loop (after line 643), write the receivable when `onAccountCents > 0n`, using the same FOR UPDATE pattern as the `store_credit` slice (lines 565-621) but on the receivable columns:

```ts
          let receivableLedgerId: string | null = null;
          if (onAccountCents > 0n) {
            const rows = await tx.$queryRawUnsafe<{
              id: string; tenant_id: string; receivable_balance_minor: bigint;
              receivable_currency_code: string | null; deleted_at: Date | null;
            }[]>(
              `SELECT id, tenant_id, receivable_balance_minor,
                      receivable_currency_code, deleted_at
               FROM customers WHERE id = $1::uuid FOR UPDATE`,
              input.customer_id!,
            );
            const customer = rows[0];
            if (!customer || customer.deleted_at || customer.tenant_id !== ctx.tenantId) {
              throw new UnprocessableEntityException({ code: "unknown_customer", message: "Customer not found" });
            }
            if (customer.receivable_currency_code && customer.receivable_currency_code !== input.currency_code) {
              throw new BadRequestException({
                code: "currency_mismatch",
                message: "Customer receivable currency does not match this sale",
              });
            }
            const after = BigInt(customer.receivable_balance_minor) + onAccountCents;
            const ledger = await tx.customerReceivableLedger.create({
              data: {
                tenant_id: ctx.tenantId,
                customer_id: input.customer_id!,
                amount_minor: onAccountCents,
                balance_after_minor: after,
                currency_code: input.currency_code,
                reference_table: "sale",
                reference_id: sale.id,
                created_by: ctx.cashierId,
              },
            });
            receivableLedgerId = ledger.id;
            await tx.customer.update({
              where: { id: input.customer_id! },
              data: { receivable_balance_minor: after, receivable_currency_code: input.currency_code },
            });
            await tx.sale.update({ where: { id: sale.id }, data: { balance_due_cents: onAccountCents } });
          }
```
Also set `balance_due_cents: onAccountCents` may instead be included directly in the `tx.sale.create` data (simpler — do that and drop the trailing update).

d. Audit payload (line 692-712): add `balance_due_cents: onAccountCents.toString()` and `receivable_ledger_id` when set.

e. Invoice-only support in the receipt endpoint: change `hasBankTransfer` (line 985) so bank details are also surfaced when the sale has an outstanding balance — the printed document doubles as the invoice telling the customer where to transfer:

```ts
  private hasBankTransfer(sale: SaleResponse): boolean {
    if (sale.payment_method === "bank_transfer") return true;
    if (BigInt(sale.balance_due_cents) > 0n) return true; // open balance → show where to pay
    return (sale.payments ?? []).some((p) => p.method === "bank_transfer");
  }
```

f. Response shaping: in `findOne` (line 1011) add `balance_due_cents: sale.balance_due_cents.toString(),` and add `balance_due_cents: string;` to `SaleResponse` + union statuses `"partially_paid" | "unpaid"` in `SaleResponse["payment_status"]` and `SaleSummary["payment_status"]`; add `balance_due_cents` to the list select + `SaleSummary`.

- [ ] **Step 5: Run tests until green**

Run: `pnpm --filter api test -- create-sale.on-account` then the full sales suite `pnpm --filter api test -- sales`
Expected: all PASS (existing split/cash/card specs unchanged).

- [ ] **Step 6: Run RLS + typecheck, commit**

Run: `pnpm test:rls && pnpm typecheck`

```bash
git add apps/api packages/db
git commit -m "feat(pos): credit sales — on_account tender, receivable ledger write"
```

---

### Task 3: Receivables module — summary + settle endpoint (API)

**Files:**
- Create: `apps/api/src/tenant/receivables/receivables.module.ts`
- Create: `apps/api/src/tenant/receivables/receivables.controller.ts`
- Create: `apps/api/src/tenant/receivables/receivables.service.ts`
- Create: `apps/api/src/tenant/receivables/dto/settle.dto.ts`
- Modify: `apps/api/src/tenant/tenant.module.ts` (register module — follow how `StoreCreditModule` is registered)
- Test: `apps/api/test/receivables/settle.spec.ts`

**Interfaces:**
- Consumes: Task 1/2 schema + statuses; `AuditService`; `PaymentProofsService.submit` contract (proof `context: "sale"`, `reference_id: sale.id`).
- Produces:
  - `GET /v1/customers/:id/receivables` → `{ customer_id, balance_minor: string, currency_code: string | null, open_sales: [{ sale_id, code, occurred_at, total_cents, balance_due_cents, payment_status }], ledger: ApiReceivableLedgerEntry[] }` (roles: owner/manager/accountant).
  - `POST /v1/customers/:id/receivables/settle` (idempotent) body `SettleReceivableBody = { sale_id: uuid, method: "cash" | "card" | "bank_transfer", amount_cents: bigint-able, approval_code?: string, cash_tendered_cents?: bigint-able }` → updated summary plus `{ sale_payment_id }`. Roles: owner/manager. Errors: `sale_not_open` (400), `amount_exceeds_balance` (400), `customer_mismatch` (400), `insufficient_tendered`/`approval_code_required` (reuse messages from sales.service pre-validation).
  - Bank-transfer settlements: the endpoint records the `sale_payments` row and reduces the balance immediately; the client then uploads the receipt via the existing `POST /v1/payment-proofs` (`context: "sale"`, `reference_id: sale_id`) exactly as the POS flow does. (Proof rejection handling is Task 4.)

- [ ] **Step 1: Write failing tests** in `settle.spec.ts` (harness copied from `apps/api/test/store-credit/store-credit.spec.ts`): create a partial sale via Task 2's path, then:

```ts
it("cash settlement reduces balance and flips status to paid when fully settled", ...);
it("partial settlement leaves status partially_paid with reduced balance_due", ...);
it("settling an unpaid (full-credit) sale moves it to partially_paid", ...);
it("rejects amount above the sale's balance_due → amount_exceeds_balance", ...);
it("rejects settle on a sale not belonging to the customer → customer_mismatch", ...);
it("cashier role gets 403 forbidden_role", ...);
it("writes a negative receivable ledger row referencing the sale_payment", ...);
it("summary lists open sales and current balance", ...);
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter api test -- receivables` → FAIL (404 route).

- [ ] **Step 3: Implement DTO** `dto/settle.dto.ts`:

```ts
import { z } from "zod";

const BigIntable = z.union([z.string(), z.number()]).transform((v) =>
  typeof v === "string" ? BigInt(v) : BigInt(Math.round(v)),
);

export const SettleReceivableSchema = z
  .object({
    sale_id: z.string().uuid(),
    method: z.enum(["cash", "card", "bank_transfer"]),
    amount_cents: BigIntable,
    approval_code: z.string().min(4).max(20).optional(),
    cash_tendered_cents: BigIntable.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.method === "card" && !d.approval_code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approval_code"], message: "approval_code is required for card settlements" });
    }
    if (d.method === "cash" && d.cash_tendered_cents == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cash_tendered_cents"], message: "cash_tendered_cents is required for cash settlements" });
    }
  });

export type SettleReceivableBody = z.infer<typeof SettleReceivableSchema>;
```

- [ ] **Step 4: Implement service** `receivables.service.ts` — same skeleton as `StoreCreditService` (role sets `MUTATOR_ROLES = owner|manager`, `READER_ROLES = owner|manager|accountant`; `basePrisma.$transaction` + `SET LOCAL` + customer `FOR UPDATE`). Core of `settle()` inside the tx, after locking the customer row and loading the sale:

```ts
        const sale = await tx.sale.findFirst({
          where: { id: body.sale_id, deleted_at: null },
          select: { id: true, customer_id: true, balance_due_cents: true, currency_code: true, payment_status: true },
        });
        if (!sale) throw new NotFoundException({ code: "sale_not_found", message: "Sale not found" });
        if (sale.customer_id !== customerId) {
          throw new BadRequestException({ code: "customer_mismatch", message: "Sale does not belong to this customer" });
        }
        if (sale.balance_due_cents <= 0n || !["partially_paid", "unpaid"].includes(sale.payment_status)) {
          throw new BadRequestException({ code: "sale_not_open", message: "Sale has no outstanding balance" });
        }
        if (amount <= 0n) throw new BadRequestException({ code: "invalid_payment_amount", message: "Amount must be positive" });
        if (amount > sale.balance_due_cents) {
          throw new BadRequestException({ code: "amount_exceeds_balance", message: "Amount exceeds the sale's outstanding balance" });
        }
        if (body.method === "cash" && body.cash_tendered_cents! < amount) {
          throw new BadRequestException({ code: "insufficient_tendered", message: "Cash tendered is less than the amount" });
        }

        const payment = await tx.salePayment.create({
          data: {
            tenant_id: tenantId,
            sale_id: sale.id,
            method: body.method,
            amount_cents: amount,
            approval_code: body.approval_code ?? null,
            cash_tendered_cents: body.cash_tendered_cents ?? null,
            change_due_cents: body.method === "cash" ? body.cash_tendered_cents! - amount : null,
          },
        });

        const newDue = sale.balance_due_cents - amount;
        await tx.sale.update({
          where: { id: sale.id },
          data: { balance_due_cents: newDue, payment_status: newDue === 0n ? "paid" : "partially_paid" },
        });

        const after = BigInt(customer.receivable_balance_minor) - amount;
        const ledger = await tx.customerReceivableLedger.create({
          data: {
            tenant_id: tenantId, customer_id: customerId,
            amount_minor: -amount, balance_after_minor: after,
            currency_code: sale.currency_code,
            reference_table: "sale_payment", reference_id: payment.id,
            created_by: actorId,
          },
        });
        await tx.customer.update({ where: { id: customerId }, data: { receivable_balance_minor: after } });
        return { paymentId: payment.id, ledgerId: ledger.id, newDue, after };
```

Audit action: `receivable_settled` (entity `sale`, before `{ balance_due_cents }`, after `{ balance_due_cents, amount_cents, method, sale_payment_id, ledger_id }`; mask nothing — no account numbers involved; approval codes masked with the `maskApprovalCode` pattern from `sales.service.ts:1099`). `getSummary()` reads customer + `sale.findMany({ where: { customer_id, balance_due_cents: { gt: 0n }, deleted_at: null } })` + last 100 ledger rows.

- [ ] **Step 5: Implement controller** `receivables.controller.ts` — clone `StoreCreditController` shape: `@Controller("v1/customers")`, `@Get(":id/receivables")` (RateLimit 60/min, `assertCanRead`), `@Post(":id/receivables/settle")` (`@HttpCode(200)`, `@UseInterceptors(IdempotencyInterceptor)`, `@Idempotent()`, RateLimit 30/min, `assertCanMutate`, `buildCtx` helper). Register `ReceivablesModule` (providers: service + `AuditService` import pattern copied from `StoreCreditModule`) in the tenant module.

- [ ] **Step 6: Run tests green, RLS, commit**

Run: `pnpm --filter api test -- receivables && pnpm test:rls && pnpm typecheck`

```bash
git add apps/api
git commit -m "feat(receivables): customer balance summary + settle endpoint"
```

---

### Task 4: Proof rejection reopens a settled balance (API)

**Files:**
- Modify: `apps/api/src/payment-proofs-shared/payment-proofs.service.ts` (the `reject` path for `context="sale"`)
- Test: `apps/api/test/receivables/settle-proof-reject.spec.ts`

**Interfaces:**
- Consumes: Task 3's settlement rows (`sale_payments` row whose `payment_proof_id` gets linked when the proof is submitted; a receivable ledger row with `reference_table: "sale_payment"`).
- Produces: rejecting a sale-context proof whose `sale_payments` row was a **settlement** (i.e. a `customer_receivable_ledger` row exists with `reference_table = "sale_payment"` and `reference_id = that payment id`) writes a reversing positive ledger row, restores `customers.receivable_balance_minor` and `sales.balance_due_cents`, and sets `payment_status` back to `partially_paid` (or `unpaid` when the restored balance equals `total_cents`). Original ledger rows are never edited.

- [ ] **Step 1: Read `payment-proofs.service.ts` first** — find where `reject` currently mutates the sale for `context="sale"` (it sets the sale `disputed` for POS bank-transfer sales). The new logic must branch: proofs tied to a settlement payment reopen the balance instead of (or in addition to) the existing dispute behavior. Match how the proof is linked to the `sale_payments` row (`payment_proof_id` column) — if the current flow never back-links settlements, add the link in Task 3's submit path or locate it via `salePayment.findFirst({ where: { sale_id, method: "bank_transfer" } })` ordering by `created_at desc`; prefer the explicit `payment_proof_id` link (update it when the proof is submitted — the shared submit path already resolves the sale by `reference_id`).

- [ ] **Step 2: Write failing test** — full flow: partial sale → bank-transfer settle → submit proof → reject proof → expect `balance_due_cents` restored, customer balance restored, status `partially_paid`, and a NEW positive ledger row (`reference_table: "sale_payment"`, note or reference tying it to the rejection); the original negative row untouched.

- [ ] **Step 3: Implement** inside the reject transaction (append-only: reversing row, never edits). Audit action `receivable_reopened`.

- [ ] **Step 4: Run green** — `pnpm --filter api test -- receivables && pnpm --filter api test -- payment-proof && pnpm test:rls`

- [ ] **Step 5: Commit** — `git commit -m "fix(receivables): rejected settlement proof reopens the balance"`

---

### Task 5: POS PaymentSheet — "On account" tender (web)

**Files:**
- Modify: `apps/web/src/app/[locale]/pos/_components/PaymentSheet.tsx`
- Create: `apps/web/src/app/[locale]/pos/_components/OnAccountBody.tsx`
- Modify: the POS page's submit handler (caller of `PaymentSheet` — follow `onSubmit` up from `PaymentSheet.tsx`; it builds the `CreateSale` request) to pass `on_account_cents`.
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ar.json`
- Test: extend the POS component/e2e coverage where `PaymentSheet` is already tested (locate with `grep -r "PaymentSheet" apps/web --include=*.spec.* --include=*.test.*`; if only e2e exists, add the e2e case in Task 7).

**Interfaces:**
- Consumes: `PaymentSheet` props (`total_cents`, `customer`, `onSubmit(payment: PaymentSubmit)`); role from the session (find how the POS page reads the current user's role — the same source that gates manager-only actions).
- Produces: `PaymentSubmit` union gains `{ method: "on_account"; paid_payments: SplitPaymentSlice[]; on_account_cents: number }`; new method id `"oa"` in the method tab row.

- [ ] **Step 1: Add strings** — `en.json` under `pos.payment.methods`: `"onAccount": "On account"`; under `pos.payment.onAccount`: `{ "title": "Sell on account", "needsCustomer": "Attach a customer to sell on account", "notPermitted": "Only managers can sell on account", "payNowLabel": "Paid now", "balanceLabel": "Left on account", "confirm": "Complete sale · on account" }`. Mirror in `ar.json` (Arabic: آجل / البيع بالآجل / المدفوع الآن / المتبقي على الحساب — confirm against `docs/i18n-glossary.md`, adding the terms there per Task 8).

- [ ] **Step 2: Build `OnAccountBody.tsx`** — pattern-match `SplitTenderBody.tsx`: a "paid now" amount input (defaults 0 → full credit) with optional method sub-select (cash tendered / card approval code) reusing the slice editing UI from `SplitTenderBody` if its slice row component is exportable, otherwise a single slice (one method) for v1 — **v1 scope: one paid-now slice + remainder on account** (split + on-account combined is out of scope; note it in the file header comment). Shows remainder `total - paidNow` prominently in the serif display style used for `changeDueLabel` (PaymentSheet.tsx:326-346, `--sage` block → use the accent/warn token block instead since money is owed: `--rose-soft`/`--rose` is for errors; use `var(--bg-sunk)` + `var(--ink)`; follow existing token names only).

- [ ] **Step 3: Wire into `PaymentSheet.tsx`** — add `"oa"` to `PaymentMethodId` and the tab array (icon: `NotebookPen` or `UserRound` from lucide, stroke 1.5); disable with tooltip `onAccount.needsCustomer` when `!customer`, and hide entirely when the session role is not owner/manager (accept a new optional `canSellOnAccount?: boolean` prop, threaded from the POS page). On submit: `dispatchSubmit({ method: "on_account", paid_payments, on_account_cents })`.

- [ ] **Step 4: Update the POS submit handler** — map the new variant to the CreateSale request body: `payments` = paid slices (omit when empty), `on_account_cents` set, `customer_id` already attached. Show the existing success/receipt screen; balance due badge on the receipt view comes from `sale.balance_due_cents` in the response.

- [ ] **Step 5: Invoice label on the receipt view** — locate the POS receipt component (`grep -r "getSaleForReceipt\|/receipt" apps/web/src/app/[locale]/pos`); when `sale.balance_due_cents > 0`, render an "Invoice · balance due" banner (strings `pos.receipt.invoiceLabel`, `pos.receipt.balanceDue` in both locales) above the totals, and keep showing the bank-details block the API now returns for open-balance sales (Task 2e).

- [ ] **Step 6: Verify** — `pnpm --filter web typecheck` (or `pnpm typecheck`), `pnpm i18n:check`, run any existing PaymentSheet unit tests.

- [ ] **Step 7: Commit** — `git commit -m "feat(pos): on-account tender in the payment sheet"`

---

### Task 6: Customer Balance tab + receive payment (web)

**Files:**
- Modify: `apps/web/src/app/[locale]/(shell)/customers/[id]/detail-client.tsx` (add a Balance tab next to the existing Store credit tab — read the file first and mirror the Store credit tab's structure exactly)
- Create: `apps/web/src/app/[locale]/(shell)/customers/[id]/_components/BalanceTab.tsx`
- Create: `apps/web/src/app/[locale]/(shell)/customers/[id]/_components/ReceivePaymentModal.tsx`
- Modify: `apps/web/src/lib/api/customers.ts` (add `getReceivables(customerId)` and `settleReceivable(customerId, body)` fetchers following the file's existing patterns)
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ar.json`

**Interfaces:**
- Consumes: Task 3 endpoints (`GET /v1/customers/:id/receivables`, `POST /v1/customers/:id/receivables/settle`); TanStack Query conventions from the existing customer detail tabs.
- Produces: Balance tab showing outstanding total (serif display number), open-sale list (code, date, total, balance due), ledger history, and a "Receive payment" button (owner/manager only) opening `ReceivePaymentModal`.

- [ ] **Step 1: Strings** — `customers.balance.*`: `title`, `outstanding`, `openSales`, `history`, `receivePayment`, `empty` headline/body (every empty list gets display-font headline + sentence + CTA per CLAUDE.md; CTA = link to POS), `settledToast`; `customers.balance.modal.*`: `saleLabel`, `amountLabel`, `methodLabel`, `bankTransferHint` (explains the receipt upload continues the proof flow), `submit`. Arabic mirrors; glossary terms in Task 8.

- [ ] **Step 2: API client fns** in `customers.ts` (respect its existing fetch wrapper + bigint-as-string handling).

- [ ] **Step 3: BalanceTab** — TanStack Query on `["customers", id, "receivables"]`; loading skeleton + error + empty states matching the Store credit tab.

- [ ] **Step 4: ReceivePaymentModal** — sale picker (open sales only), amount (default = that sale's balance), method tabs cash/card/bank-transfer. Cash: tendered input (reuse chip pattern from PaymentSheet if trivially extractable, else plain input). Card: approval code input. Bank transfer: after the settle call succeeds, chain the existing proof-upload UI/flow used by the POS `TransferBody`/proof submit client code (locate with `grep -r "payment-proofs" apps/web/src/lib/api`); the modal walks settle → upload receipt → done. Invalidate the receivables query + customer query on success.

- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm i18n:check`; manually run `pnpm dev:web` and exercise the tab in EN and AR (RTL) against seeded data if the API is up.

- [ ] **Step 6: Commit** — `git commit -m "feat(customers): balance tab with receive-payment flow"`

---

### Task 7: E2E + sales-list surfacing

**Files:**
- Modify: `apps/web/src/app/[locale]/(shell)/sales/...` list UI — add `partially_paid`/`unpaid` to the payment-status filter + badge rendering (locate the status badge component via `grep -r "payment_pending" apps/web/src`), with strings `sales.status.partiallyPaid` / `sales.status.unpaid` in both locales.
- Create: e2e spec in the tenant Playwright suite (find the folder via `grep -r "test:e2e" package.json` → follow to the config): `credit-sale.spec.ts` — EN + AR: complete a partial sale on account (manager login), verify balance badge, open customer Balance tab, settle in cash, verify sale shows paid.

**Interfaces:**
- Consumes: everything above; seeded demo tenant `owner@acme.test / Demo123!`.

- [ ] **Step 1: Add the two status strings + badge mapping; typecheck + i18n:check.**
- [ ] **Step 2: Write the e2e spec (both locales, following an existing sales e2e spec's fixtures).**
- [ ] **Step 3: Run** `pnpm test:e2e -- credit-sale` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(sales): surface credit statuses + e2e credit-sale flow"`

---

### Task 8: Docs, glossary, ADR, tasks.md

**Files:**
- Modify: `docs/billing-flow.md` (new "Credit sales & customer receivables" section: explicit `on_account_cents` contract, ledger discipline, settle flow, proof-rejection reopen, role gate, out-of-scope list from the spec)
- Modify: `docs/PAGES.md` (#35 Customer Detail gains Balance tab; payment modal spec lines ~242-254 gain the On-account tab; sales list filter values)
- Modify: `docs/i18n-glossary.md` (EN→AR: On account → آجل; Outstanding balance → الرصيد المستحق; Receive payment → استلام دفعة — verify against existing glossary style and adjust)
- Create: `docs/0007-customer-receivables.md` (ADR: mirror-the-store-credit-ledger decision; no separate AR module; explicit `on_account_cents` rather than implicit underpayment; immutable once adopted)
- Modify: `tasks.md` (add the credit-sales items as completed with a one-line note, per CLAUDE.md "always update tasks.md")

- [ ] **Step 1: Write all four doc updates + ADR.**
- [ ] **Step 2: Update `tasks.md`.**
- [ ] **Step 3: Run the full gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:rls && pnpm i18n:check`
- [ ] **Step 4: Commit** — `git commit -m "docs: credit sales & receivables — billing flow, pages, glossary, ADR 0007"`
