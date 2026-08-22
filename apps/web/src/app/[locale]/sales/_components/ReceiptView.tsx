"use client";

import { useTranslations } from "next-intl";
import type { ReceiptResponse } from "@/lib/api/sales";
import { tenantLogoPublicUrl } from "@/lib/api/business";
import { formatMoney } from "@/lib/currency";

export type ReceiptSize = "58mm" | "80mm" | "a4";

/**
 * Document data for ReceiptView. Same shape the sale receipt has always
 * fetched (`ReceiptResponse`), extended with an optional `quotation` block
 * used only by variant="quotation" (QT code + valid-until row). For the
 * quotation variant, `doc.sale` still carries the shared fields the layout
 * reads (code, occurred_at, lines, totals, currency) — callers populate it
 * with quotation data instead of a real sale.
 */
export type ReceiptViewDoc = ReceiptResponse & {
  quotation?: { code: string; valid_until: string };
};

// Receipts always print Western digits ("en") regardless of UI locale.
function centsMajor(cents: string | bigint, currency: string): string {
  return formatMoney(cents, currency || "EGP", "en");
}

function fmtDate(iso: string, locale: "en" | "ar"): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReceiptView({
  doc,
  locale,
  size,
  variant = "receipt",
}: {
  doc: ReceiptViewDoc;
  locale: "en" | "ar";
  size: ReceiptSize;
  variant?: "receipt" | "quotation";
}) {
  const t = useTranslations("receipt");
  const { sale, tenant, branch, cashier, customer, bank_account } = doc;
  const isQuotation = variant === "quotation";
  const tenantName = locale === "ar" ? tenant.name_i18n.ar || tenant.name : tenant.name;
  const logoUrl = tenantLogoPublicUrl(tenant.id, tenant.logo_url);
  const branchLabel = branch
    ? `${branch.code} · ${branch.name_i18n[locale] || branch.name_i18n.en}`
    : null;
  const isPaid = sale.payment_status === "paid";
  const isA4 = size === "a4";
  const balanceDueCents = BigInt(sale.balance_due_cents || "0");
  const hasBalanceDue = balanceDueCents > 0n;

  const stamp = (
    <span className={`receipt-stamp ${isPaid ? "" : "receipt-stamp-pending"}`}>
      {isPaid ? t("status.paid") : t("status.pending")}
    </span>
  );

  return (
    <article
      className={`receipt receipt-${size} ${locale === "ar" ? "receipt-ar" : ""}`}
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      {/* A4 prints on A4 paper; thermal keeps the global zero-margin @page. */}
      {isA4 && (
        <style
          dangerouslySetInnerHTML={{
            __html: "@media print { @page { size: A4; margin: 14mm; } }",
          }}
        />
      )}

      {isA4 ? (
        <header className="receipt-header receipt-a4-header">
          <div className="receipt-a4-identity">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenantName} className="receipt-logo" />
            ) : (
              <h1 className="receipt-name">{tenantName}</h1>
            )}
            {tenant.legal_name && (
              <div className="receipt-a4-legal">{tenant.legal_name}</div>
            )}
            {tenant.tax_registration_number && (
              <div className="receipt-a4-muted">
                {t("invoice.taxId")}: {tenant.tax_registration_number}
              </div>
            )}
            {branchLabel && <div className="receipt-a4-muted">{branchLabel}</div>}
            {branch?.address_i18n && (
              <div className="receipt-a4-muted">
                {branch.address_i18n[locale] || branch.address_i18n.en}
              </div>
            )}
            {customer && (
              <div className="receipt-a4-muted">
                {t("meta.customer")}: {customer.name}
              </div>
            )}
          </div>
          <div className="receipt-a4-docmeta">
            <div className="receipt-a4-title">
              {isQuotation ? t("quote.title") : t("invoice.title")}
            </div>
            <div className="receipt-meta-row">
              <span>{t("meta.ticket")}</span>
              <strong>{sale.code}</strong>
            </div>
            <div className="receipt-meta-row">
              <span>{t("meta.date")}</span>
              <span>{fmtDate(sale.occurred_at, locale)}</span>
            </div>
            {isQuotation && doc.quotation ? (
              <div className="receipt-meta-row">
                <span>{t("quote.validUntil")}</span>
                <span>{fmtDate(doc.quotation.valid_until, locale)}</span>
              </div>
            ) : (
              <div className="receipt-meta-row">
                <span>{t("meta.cashier")}</span>
                <span>{cashier?.name ?? "—"}</span>
              </div>
            )}
            {!isQuotation && <div className="receipt-a4-stamp">{stamp}</div>}
          </div>
        </header>
      ) : (
        <>
          <header className="receipt-header">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenantName} className="receipt-logo" />
            ) : (
              <h1 className="receipt-name">{tenantName}</h1>
            )}
            {isQuotation && (
              <div className="kicker" style={{ marginTop: 4 }}>{t("quote.title")}</div>
            )}
            {branchLabel && <div style={{ fontSize: 10 }}>{branchLabel}</div>}
            {branch?.address_i18n && (
              <div style={{ fontSize: 10, color: "#8A8478" }}>
                {branch.address_i18n[locale] || branch.address_i18n.en}
              </div>
            )}
          </header>

          <div className="receipt-meta">
            <div className="receipt-meta-row">
              <span>{t("meta.ticket")}</span>
              <strong>{sale.code}</strong>
            </div>
            {customer && (
              <div className="receipt-meta-row">
                <span>{t("meta.customer")}</span>
                <span>{customer.name}</span>
              </div>
            )}
            {isQuotation && doc.quotation ? (
              <div className="receipt-meta-row">
                <span>{t("quote.validUntil")}</span>
                <span>{fmtDate(doc.quotation.valid_until, locale)}</span>
              </div>
            ) : (
              <div className="receipt-meta-row">
                <span>{t("meta.cashier")}</span>
                <span>{cashier?.name ?? "—"}</span>
              </div>
            )}
            <div className="receipt-meta-row">
              <span>{t("meta.date")}</span>
              <span>{fmtDate(sale.occurred_at, locale)}</span>
            </div>
          </div>
        </>
      )}

      {!isQuotation && hasBalanceDue && (
        <div
          role="status"
          style={{
            background: "var(--bg-sunk)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius)",
            padding: "var(--space-2) var(--space-3)",
            marginBottom: "var(--space-2)",
            fontSize: 12,
            color: "var(--ink-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "var(--space-2)",
          }}
        >
          <span className="kicker">{t("invoiceLabel")}</span>
          <span className="tnum" style={{ fontWeight: 500 }}>
            {t("balanceDue")}: {centsMajor(sale.balance_due_cents, sale.currency_code)}
          </span>
        </div>
      )}

      <section className="receipt-items">
        {isA4 && (
          <div className="receipt-line receipt-col-head">
            <span className="receipt-line-qty">{t("cols.qty")}</span>
            <div className="receipt-line-name">{t("cols.item")}</div>
            <span className="receipt-line-amount">{t("cols.amount")}</span>
          </div>
        )}
        {sale.lines.map((line) => {
          const name = line.name_i18n[locale] || line.name_i18n.en || line.sku;
          return (
            <div key={line.id} className="receipt-line">
              <span className="receipt-line-qty">×{line.qty}</span>
              <div className="receipt-line-name">
                {name}
                {line.note && <div className="receipt-line-note">+ {line.note}</div>}
              </div>
              <span className="receipt-line-amount">
                {centsMajor(line.line_total_cents, sale.currency_code)}
              </span>
            </div>
          );
        })}
      </section>

      <section className="receipt-totals">
        <div className="receipt-totals-row">
          <span>{t("totals.subtotal")}</span>
          <span>{centsMajor(sale.subtotal_cents, sale.currency_code)}</span>
        </div>
        {BigInt(sale.discount_cents) > 0n && (
          <div className="receipt-totals-row receipt-totals-row-muted">
            <span>{t("totals.discount")}</span>
            <span>−{centsMajor(sale.discount_cents, sale.currency_code)}</span>
          </div>
        )}
        {BigInt(sale.tax_cents) > 0n && (
          <div className="receipt-totals-row">
            <span>{t("totals.tax")}</span>
            <span>{centsMajor(sale.tax_cents, sale.currency_code)}</span>
          </div>
        )}
        <div className="receipt-total-row">
          <span>{t("totals.total")}</span>
          <span>{centsMajor(sale.total_cents, sale.currency_code)}</span>
        </div>
      </section>

      {!isQuotation && sale.payment_method === "cash" && sale.cash_tendered_cents && (
        <div className="receipt-totals">
          <div className="receipt-totals-row">
            <span>{t("tender.cashTendered")}</span>
            <span>{centsMajor(sale.cash_tendered_cents, sale.currency_code)}</span>
          </div>
          {sale.change_due_cents && (
            <div className="receipt-totals-row">
              <span>{t("tender.changeDue")}</span>
              <span>{centsMajor(sale.change_due_cents, sale.currency_code)}</span>
            </div>
          )}
        </div>
      )}

      {(isQuotation
        ? !!bank_account
        : (sale.payment_method === "bank_transfer" || hasBalanceDue) && !!bank_account) && (
        <section className="receipt-bank">
          <div style={{ fontWeight: 600, marginBottom: "var(--space-1)" }}>{t("bank.heading")}</div>
          <div>
            {t("bank.bankName")}: {bank_account!.bank_name}
          </div>
          <div>
            {t("bank.holder")}: {bank_account!.account_holder}
          </div>
          {bank_account!.iban_last4 && (
            <div>{t("bank.ibanLine", { last4: bank_account!.iban_last4 })}</div>
          )}
        </section>
      )}

      {isQuotation ? (
        <div style={{ textAlign: "center", fontSize: 10, color: "#8A8478" }}>
          {t("quote.estimateNote")}
        </div>
      ) : (
        !isA4 && <div style={{ textAlign: "center" }}>{stamp}</div>
      )}

      <footer className="receipt-footer">
        <p className="receipt-thanks">{t("thanks")}</p>
        <p style={{ marginTop: "var(--space-2)" }}>{t("footer.tagline")}</p>
      </footer>
    </article>
  );
}
