/**
 * Credit-sale (on-account) e2e flow — EN + AR.
 *
 * NOTE (Task 7, 2026-08-21): this repo does not yet have a Playwright e2e
 * harness. `pnpm test:e2e` is documented in CLAUDE.md and docs/i18n-guide.md
 * but the script does not exist in package.json, `@playwright/test` is not
 * installed in any workspace, and there is no `playwright.config.ts` or
 * `webServer` boot config anywhere in the repo. This gap predates this task
 * (see docs/smoke-2026-08-14.md and task-5-report.md, which deferred e2e
 * coverage of the on-account tender to this task) and is out of this task's
 * scope to build from scratch.
 *
 * This spec is written to the shape a Playwright e2e harness would need
 * (fixtures, `test.describe` per locale, direct locators keyed to the real
 * component tree — verified against source, not guessed) so it can be
 * dropped in and run once #harness lands. It could NOT be executed in this
 * environment — see task-7-report.md for exactly what was and wasn't run.
 *
 * Flow covered:
 *   1. Owner/manager logs in (owner@acme.test / Demo123!, seeded demo
 *      tenant; seeded customer "Nadia Hosny" / code C-001, see
 *      packages/db/prisma/seed-data.ts).
 *   2. POS: add a line, attach the seeded customer, pay partially on
 *      account (cash now + remainder on account) -> sale is
 *      `partially_paid`. Captures the sale code from the completion toast
 *      (POS never auto-navigates to the receipt — pos-client.tsx shows a
 *      dismissable toast with an "Open receipt" link that opens a new tab).
 *   3. Sales list: the new sale shows the "Partially paid" badge; the
 *      partially-paid filter chip narrows to it.
 *   4. Customer detail -> Balance tab: the sale appears in "Open sales"
 *      with the correct balance due.
 *   5. Receive payment (cash, full remaining balance) via the modal. Cash
 *      settlement resolves immediately (ReceivePaymentModal.tsx calls
 *      onSuccess() straight from the settle mutation for non-bank-transfer
 *      methods — there is no "Done" stage/button for cash, that stage only
 *      exists for the bank_transfer proof-upload path).
 *   6. Balance tab shows no open balance for that customer; sales list now
 *      shows the sale as "Paid".
 */
import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = "owner@acme.test";
const OWNER_PASSWORD = "Demo123!";
const CUSTOMER_SEARCH = "Nadia";

async function login(page: Page, locale: "en" | "ar") {
  await page.goto(`/${locale}/login`);
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  // No fixed post-login route is guaranteed (goPostLogin() in login/page.tsx
  // lands on the dashboard "/" unless a `returnTo` is present) — the only
  // reliable signal is leaving /login.
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

for (const locale of ["en", "ar"] as const) {
  test.describe(`credit sale on account — ${locale}`, () => {
    test("partial on-account sale, then settled to paid", async ({ page }) => {
      await login(page, locale);

      // ── POS: add a product, attach the seeded customer ──────────────
      await page.goto(`/${locale}/pos`);
      await page.locator(".pos-tile").first().click();

      // Cart.tsx: "Add customer" trigger is <button class="pos-customer">.
      await page.locator(".pos-customer").click();
      // CustomerPickerModal.tsx: search input has no accessible label, only
      // a placeholder (pos.customerPicker.searchPlaceholder); result rows
      // are <button class="pos-picker-row">, not [role='option'].
      await page
        .getByPlaceholder(
          locale === "en"
            ? "Search by name, phone, email, or code…"
            : "بحث بالاسم أو الهاتف أو البريد أو الكود…",
        )
        .fill(CUSTOMER_SEARCH);
      await page.locator(".pos-picker-row").first().click();

      // ── Payment sheet: On account tab, partial cash-now + remainder ──
      // Cart.tsx: pay trigger is <button class="pos-pay"> (its aria-label
      // includes the live formatted total, so match on class, not name).
      await page.locator(".pos-pay").click();
      // PaymentSheet.tsx (lines ~255-306): method switcher is a row of
      // plain <button> elements with NO role="tab" — only
      // ReceivePaymentModal's method tabs (used later) are real
      // role="tab" elements. Match by accessible button name instead.
      await page
        .getByRole("button", { name: locale === "en" ? "On account" : "آجل" })
        .click();

      // OnAccountBody.tsx: BOTH the "Paid now" checkbox (wrapped by a
      // <label> whose text is t("payNowLabel")) and the paid-amount
      // <input type="number"> (aria-label={t("payNowLabel")} directly)
      // share the same accessible name — disambiguate by ARIA role
      // (checkbox vs. the number input's implicit "spinbutton" role)
      // rather than getByLabel, which would be ambiguous between them.
      const payNowLabel = locale === "en" ? "Paid now" : "المدفوع الآن";
      await page.getByRole("checkbox", { name: payNowLabel }).check();
      // Default paid-now method is cash; type a concrete partial amount
      // (major units) so the sale actually lands as partially_paid rather
      // than fully unpaid.
      await page.getByRole("spinbutton", { name: payNowLabel }).fill("1");
      // Cash requires cash_tendered_cents >= the paid amount (OnAccountBody
      // .tsx's `valid` check) — the tendered input is a separate field,
      // placeholder-labeled (aria-label = t("cashTenderedPlaceholder")).
      await page
        .getByPlaceholder(locale === "en" ? "Amount tendered" : "المبلغ المُسلَّم")
        .fill("1");

      await page
        .getByRole("button", {
          name: locale === "en" ? /Complete sale/ : /إتمام البيع/,
        })
        .click();

      // POS never auto-navigates on sale completion — pos-client.tsx shows
      // a toast (role="status") with the sale code embedded in its text
      // (`${t("payment.completeSale")} · ${result.code}`) and a
      // target="_blank" link to the receipt. Read the code out of the
      // toast instead of assuming a redirect.
      const toastText = await page.getByRole("status").innerText();
      const saleCode = toastText.split("·").pop()?.trim() ?? "";
      expect(saleCode.length).toBeGreaterThan(0);

      // ── Sales list: badge + filter ──────────────────────────────────
      await page.goto(`/${locale}/sales`);
      await page
        .getByRole("button", { name: locale === "en" ? "Partially paid" : "مدفوعة جزئياً" })
        .click();
      const row = page.locator("tr", { hasText: saleCode });
      await expect(row.locator(".sl-pill-partial")).toBeVisible();
      await expect(row.locator(".sl-pill-partial")).toHaveText(
        locale === "en" ? "Partially paid" : "مدفوعة جزئياً",
      );

      // ── Customer detail -> Balance tab ───────────────────────────────
      // customers-list-client.tsx: rows are <tr onClick={navigate}>, name
      // is in <div class="cu-name">.
      await page.goto(`/${locale}/customers`);
      await page
        .getByPlaceholder(
          locale === "en"
            ? "Search by name, phone, email, or code…"
            : "بحث بالاسم أو الهاتف أو البريد أو الكود…",
        )
        .fill(CUSTOMER_SEARCH);
      await page.locator(".cu-name", { hasText: CUSTOMER_SEARCH }).first().click();
      // detail-client.tsx: tabs ARE real role="tab" elements.
      await page.getByRole("tab", { name: locale === "en" ? "Balance" : "الرصيد" }).click();

      await expect(
        page.locator(".cu-table").first().locator("tr", { hasText: saleCode }),
      ).toBeVisible();

      // ── Receive payment: settle the remaining balance in cash ───────
      await page
        .getByRole("button", { name: locale === "en" ? "Receive payment" : "استلام دفعة" })
        .click();
      // ReceivePaymentModal.tsx: amount defaults to the full balance due
      // for the selected (first) open sale; cash is the default method.
      await page
        .getByRole("button", { name: locale === "en" ? "Record payment" : "تسجيل الدفعة" })
        .click();
      // Cash settlement resolves immediately — ReceivePaymentModal.tsx's
      // settle mutation calls onSuccess() (closing the modal) straight
      // away for any method other than bank_transfer. There is no "Done"
      // button on this path; asserting the post-close state directly.
      await expect(
        page.getByText(locale === "en" ? "No open balance" : "لا يوجد رصيد مستحق"),
      ).toBeVisible();

      // ── Sales list: sale now shows Paid ──────────────────────────────
      await page.goto(`/${locale}/sales`);
      await page.getByRole("button", { name: locale === "en" ? "Paid" : "مدفوعة" }).click();
      const settledRow = page.locator("tr", { hasText: saleCode });
      await expect(settledRow.locator(".sl-pill-paid")).toBeVisible();
    });
  });
}
