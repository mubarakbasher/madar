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
 * (fixtures, `test.describe.parallel` over locales, page-object-free direct
 * locators keyed to the real component tree) so it can be dropped in and run
 * once #harness lands. It could NOT be executed in this environment — see
 * task-7-report.md for exactly what was and wasn't run.
 *
 * Flow covered:
 *   1. Manager logs in (owner@acme.test / Demo123!, seeded demo tenant).
 *   2. POS: add a line, attach a customer, pay partially on account
 *      (cash now + remainder on account) -> sale is `partially_paid`.
 *   3. Sales list: the new sale shows the "Partially paid" badge; the
 *      partially-paid filter chip narrows to it.
 *   4. Customer detail -> Balance tab: the sale appears in "Open sales"
 *      with the correct balance due.
 *   5. Receive payment (cash, full remaining balance) via the modal.
 *   6. Balance tab shows no open sales for that sale; sales list now shows
 *      the sale as "Paid".
 */
import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = "owner@acme.test";
const OWNER_PASSWORD = "Demo123!";

async function login(page: Page, locale: "en" | "ar") {
  await page.goto(`/${locale}/login`);
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(new RegExp(`/${locale}/(pos)?$`));
}

for (const locale of ["en", "ar"] as const) {
  test.describe(`credit sale on account — ${locale}`, () => {
    test("partial on-account sale, then settled to paid", async ({ page }) => {
      await login(page, locale);

      // ── POS: add a product, attach a customer ──────────────────────
      await page.goto(`/${locale}/pos`);
      const firstTile = page.locator(".pos-tile").first();
      await firstTile.click();

      await page.locator(".pos-customer").click();
      await page
        .getByPlaceholder(locale === "en" ? "Search customers" : "بحث عن العملاء")
        .fill("Acme");
      // Pick the first matching customer in the picker list.
      await page.locator(".pos-customer-row, [role='option']").first().click();

      // ── Payment sheet: On account tab, partial cash-now + remainder ──
      await page.locator(".pos-cart-pay, button[aria-label*='Pay'], button[aria-label*='دفع']").click();
      await page.getByRole("tab", { name: locale === "en" ? "On account" : "آجل" }).click();

      // Pay part of the total now in cash, leave the rest on account.
      // OnAccountBody.tsx (apps/web/src/app/[locale]/pos/_components/OnAccountBody.tsx)
      // exposes a "pay now" toggle, a cash/card method choice, and a
      // paid-amount input; exact labels/ids to be confirmed once the
      // harness exists and this spec can actually run against the DOM.
      await page.getByLabel(locale === "en" ? "Paid now" : "مدفوع الآن").check();

      await page
        .getByRole("button", { name: locale === "en" ? /Complete sale/ : /إتمام البيع/ })
        .click();

      // Sale completed — expect redirect to the receipt.
      await page.waitForURL(new RegExp(`/${locale}/sales/.+/receipt`));
      const saleCodeText = await page.locator(".pos-receipt-code, .sl-code").first().innerText();

      // ── Sales list: badge + filter ──────────────────────────────────
      await page.goto(`/${locale}/sales`);
      await page
        .getByRole("button", { name: locale === "en" ? "Partially paid" : "مدفوعة جزئياً" })
        .click();
      const row = page.locator("tr", { hasText: saleCodeText });
      await expect(row.locator(".sl-pill-partial")).toBeVisible();
      await expect(row.locator(".sl-pill-partial")).toHaveText(
        locale === "en" ? "Partially paid" : "مدفوعة جزئياً",
      );

      // ── Customer detail -> Balance tab ───────────────────────────────
      await row.click();
      // Follow through to the customer from the receipt/sale detail, or
      // navigate directly via the customers list — exact nav TBD once the
      // harness exists and the receipt page's customer link is confirmed.
      await page.goto(`/${locale}/customers`);
      await page.getByText("Acme").first().click();
      await page.getByRole("tab", { name: locale === "en" ? "Balance" : "الرصيد" }).click();

      await expect(
        page.locator(".cu-table").first().locator("tr", { hasText: saleCodeText }),
      ).toBeVisible();

      // ── Receive payment: settle the remaining balance in cash ───────
      await page
        .getByRole("button", { name: locale === "en" ? "Receive payment" : "استلام دفعة" })
        .click();
      // Amount defaults to the full balance due for the selected sale.
      await page
        .getByRole("button", { name: locale === "en" ? "Record payment" : "تسجيل الدفعة" })
        .click();
      await page
        .getByRole("button", { name: locale === "en" ? "Done" : "تم" })
        .click();

      await expect(page.getByText(locale === "en" ? "No open balance" : "لا يوجد رصيد مفتوح")).toBeVisible();

      // ── Sales list: sale now shows Paid ──────────────────────────────
      await page.goto(`/${locale}/sales`);
      await page.getByRole("button", { name: locale === "en" ? "Paid" : "مدفوعة" }).click();
      const settledRow = page.locator("tr", { hasText: saleCodeText });
      await expect(settledRow.locator(".sl-pill-paid")).toBeVisible();
    });
  });
}
