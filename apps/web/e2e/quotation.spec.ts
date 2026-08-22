/**
 * Quotations e2e flow — EN + AR.
 *
 * NOTE (Task 7, 2026-08-22): same harness gap documented in
 * credit-sale.spec.ts applies here — this repo has no Playwright e2e
 * harness (`pnpm test:e2e` is referenced in CLAUDE.md/docs/i18n-guide.md
 * but `@playwright/test` is not installed, there is no
 * `playwright.config.ts`, and no `webServer` boot config exists anywhere).
 * This spec is grounded against the real component tree (SaveQuoteModal.tsx,
 * Cart.tsx, pos-client.tsx, quotations-client.tsx, detail-client.tsx — read
 * directly, not guessed) so it can run unmodified once #harness lands, but
 * it could NOT be executed in this environment. See task-7-8-report.md for
 * exactly what was and wasn't run.
 *
 * Flow A — save -> list -> convert -> pay -> converted:
 *   1. Owner/manager logs in, adds a product to the cart at POS.
 *   2. Cart.tsx: the "Save quote" link (`.pos-link`, icon FileText, text
 *      t("pos.quote.save")) only renders once the cart has lines, next to
 *      Hold/Clear. Click it -> SaveQuoteModal opens (role="dialog").
 *   3. SaveQuoteModal.tsx: validity-days input is the only
 *      `input[type="number"]` in the modal and defaults to 14 (`pos-input`,
 *      no accessible label — a `.kicker` div precedes it, not a real
 *      <label for>). Keep the default and submit via the primary button
 *      (`.pos-btn-primary`, text t("pos.quote.save") / "…saving" while
 *      pending).
 *   4. pos-client.tsx onSaved: cart clears, a toast (role="status", fixed
 *      bottom-end) shows `${t("quote.savedToast")} · ${code}` plus a
 *      "View"(t("quote.viewToastAction")) link opening
 *      `/${locale}/sales/quotations/${id}` in a new tab. Capture the code
 *      from the toast text (same pattern as the sale-completion toast in
 *      credit-sale.spec.ts) instead of following the link, to avoid
 *      juggling a second tab.
 *   5. Quotations list (`/sales/quotations`): rows are `<tr onClick=...>`
 *      (quotations-client.tsx), code in `.sl-code`, status pill
 *      `.sl-pill.qt-pill-open` with text t("quotationsList.statuses.open").
 *      Click the row with the saved code to reach the detail page.
 *   6. Detail page (detail-client.tsx): open-status actions render
 *      "Convert to sale" (`.qt-btn-primary`, t("quotationDetail.actions.convert"))
 *      which does `router.push(/pos?quote=<id>)`.
 *   7. Back at POS with `?quote=<id>`: pos-client.tsx hydrates the cart from
 *      the quotation snapshot and Cart.tsx shows the quote-mode banner
 *      (role="status", text t("pos.quote.convertingBanner", {code})) above
 *      the cart lines. Pay with the default method (cash, tendered amount
 *      already >= total by default in PaymentSheet.tsx) via `.pos-pay` ->
 *      "Complete sale" button.
 *   8. Sale completes -> pos-client.tsx toast shows
 *      `${t("payment.completeSale")} · ${saleCode}`. Navigate back to the
 *      quotation detail page: status pill now `qt-pill-converted`
 *      (t("quotationsList.statuses.converted")) and the actions row shows
 *      "View sale" (t("quotationDetail.actions.viewSale")) linking to
 *      `/sales/${saleId}/receipt` — assert the href contains `/receipt`.
 *
 * Flow B — cancel + expired filter chip:
 *   1. Save a second quote the same way as Flow A (steps 1-4).
 *   2. From its detail page, click "Cancel quotation"
 *      (t("quotationDetail.actions.cancel"), `.qt-btn-danger`) -> confirm
 *      modal (role="dialog", body t("quotationDetail.cancelConfirm.body"))
 *      -> confirm button t("quotationDetail.cancelConfirm.confirm").
 *   3. Status pill becomes `qt-pill-cancelled`
 *      (t("quotationsList.statuses.cancelled")); actions row collapses to
 *      Print only (no Convert/Cancel).
 *   4. Expired quotes cannot be produced via the public API — `valid_days`
 *      is clamped 1-90 server-side (SaveQuoteModal.tsx MIN_VALID_DAYS=1),
 *      so there is no client path to create an already-past-`valid_until`
 *      quote, and there is no backdating endpoint. Per the plan's fallback,
 *      only the "Expired" status filter chip is asserted here: clicking it
 *      narrows the list without erroring, and (because nothing in the
 *      seeded/created fixtures is expired) the empty state renders.
 */
import { test, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = "owner@acme.test";
const OWNER_PASSWORD = "Demo123!";

async function login(page: Page, locale: "en" | "ar") {
  await page.goto(`/${locale}/login`);
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

async function saveQuoteFromPos(page: Page, locale: "en" | "ar"): Promise<string> {
  await page.goto(`/${locale}/pos`);
  await page.locator(".pos-tile").first().click();

  // Cart.tsx: "Save quote" link only renders once lines.length > 0, styled
  // as a plain .pos-link like Hold/Clear (no role distinction between them
  // besides accessible name).
  await page
    .getByRole("button", { name: locale === "en" ? "Quote" : "عرض سعر" })
    .click();

  // SaveQuoteModal.tsx: role="dialog"; keep the default valid-days value
  // and submit via the primary save button.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Note: the primary save button reuses the same t("pos.quote.save") text
  // ("Quote"/"عرض سعر") as the cart trigger — scoping to the dialog is what
  // disambiguates it, not different copy.
  await dialog
    .getByRole("button", { name: locale === "en" ? "Quote" : "عرض سعر" })
    .click();

  // pos-client.tsx: onSaved clears the cart and shows a toast with the
  // quote code embedded (`${savedToast} · ${code}`).
  const toastText = await page.getByRole("status").innerText();
  const code = toastText.split("·").pop()?.trim() ?? "";
  expect(code.length).toBeGreaterThan(0);
  return code;
}

for (const locale of ["en", "ar"] as const) {
  test.describe(`quotations — ${locale}`, () => {
    test("save quote, convert to sale, detail shows converted + sale link", async ({
      page,
    }) => {
      await login(page, locale);
      const code = await saveQuoteFromPos(page, locale);

      // ── Quotations list: new quote visible, status Open ─────────────
      await page.goto(`/${locale}/sales/quotations`);
      const row = page.locator("tr", { hasText: code });
      await expect(row.locator(".sl-code")).toHaveText(code);
      await expect(row.locator(".qt-pill-open")).toBeVisible();
      await expect(row.locator(".qt-pill-open")).toHaveText(
        locale === "en" ? "Open" : "ساري",
      );

      // ── Detail: Convert to sale -> POS with quote-mode banner ───────
      await row.click();
      await page.waitForURL((url) => /\/sales\/quotations\/[^/]+$/.test(url.pathname));
      await page
        .getByRole("button", {
          name: locale === "en" ? "Convert to sale" : "تحويل إلى بيع",
        })
        .click();
      await page.waitForURL((url) => url.pathname.endsWith("/pos"));

      // Cart.tsx: quote-mode banner is role="status", text interpolates the
      // quote code via pos.quote.convertingBanner.
      const banner = page.getByRole("status").filter({ hasText: code });
      await expect(banner).toBeVisible();

      // ── Pay: default cash method, tendered amount already covers total ──
      await page.locator(".pos-pay").click();
      await page
        .getByRole("button", {
          name: locale === "en" ? /Complete sale/ : /إتمام البيع/,
        })
        .click();

      const saleToastText = await page.getByRole("status").innerText();
      const saleCode = saleToastText.split("·").pop()?.trim() ?? "";
      expect(saleCode.length).toBeGreaterThan(0);

      // ── Back to quote detail: status Converted, links to the receipt ──
      await page.goto(`/${locale}/sales/quotations`);
      await page.locator("tr", { hasText: code }).click();
      await page.waitForURL((url) => /\/sales\/quotations\/[^/]+$/.test(url.pathname));
      await expect(page.locator(".qt-pill-converted")).toBeVisible();
      await expect(page.locator(".qt-pill-converted")).toHaveText(
        locale === "en" ? "Converted" : "محوَّل",
      );
      const viewSaleLink = page.getByRole("link", {
        name: locale === "en" ? "View sale" : "عرض عملية البيع",
      });
      await expect(viewSaleLink).toBeVisible();
      await expect(viewSaleLink).toHaveAttribute("href", /\/receipt$/);
    });

    test("cancel a quotation; expired filter chip narrows the list", async ({
      page,
    }) => {
      await login(page, locale);
      const code = await saveQuoteFromPos(page, locale);

      await page.goto(`/${locale}/sales/quotations`);
      await page.locator("tr", { hasText: code }).click();
      await page.waitForURL((url) => /\/sales\/quotations\/[^/]+$/.test(url.pathname));

      // detail-client.tsx: "Cancel quotation" opens a confirm modal
      // (role="dialog") distinct from SaveQuoteModal's dialog (only one is
      // ever mounted at a time on this page).
      await page
        .getByRole("button", {
          name: locale === "en" ? "Cancel quotation" : "إلغاء عرض السعر",
        })
        .click();
      const confirmDialog = page.getByRole("dialog");
      await expect(confirmDialog).toBeVisible();
      await confirmDialog
        .getByRole("button", {
          name: locale === "en" ? "Cancel quotation" : "إلغاء عرض السعر",
        })
        .click();

      await expect(page.locator(".qt-pill-cancelled")).toBeVisible();
      await expect(page.locator(".qt-pill-cancelled")).toHaveText(
        locale === "en" ? "Cancelled" : "ملغى",
      );
      // Cancelled quotes only offer Print — no Convert/Reprice/Cancel.
      await expect(
        page.getByRole("button", {
          name: locale === "en" ? "Convert to sale" : "تحويل إلى بيع",
        }),
      ).toHaveCount(0);

      // ── Expired status chip: filters without erroring ───────────────
      // No client/API path exists to create an already-past-valid_until
      // quote (valid_days is clamped 1-90, no backdating endpoint), so this
      // only asserts the chip is selectable and the list responds — not
      // that a specific row appears. See plan Task 7 fallback note.
      await page.goto(`/${locale}/sales/quotations`);
      await page
        .getByRole("button", { name: locale === "en" ? "Expired" : "منتهي" })
        .click();
      await expect(
        page.getByRole("button", { name: locale === "en" ? "Expired" : "منتهي" }),
      ).toHaveClass(/sl-chip-active/);
      // Either the empty state or a filtered table renders — both are
      // valid depending on fixture state; assert no error state.
      await expect(
        page.locator(".sl-empty", { hasText: locale === "en" ? "try again" : "" }),
      ).toHaveCount(0);
    });
  });
}
