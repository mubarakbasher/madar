"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Printer, Undo2, Banknote } from "lucide-react";
import { receiptDataRequest, type ReceiptResponse } from "@/lib/api/sales";
import { tenantLogoPublicUrl } from "@/lib/api/business";
import { formatMoney } from "@/lib/currency";
import { useAuthStore } from "@/lib/auth/store";
import {
  findPairedPrinter,
  pairPrinter,
  popDrawer,
} from "@/lib/hardware/cash-drawer";
import "./receipt.css";

const REFUND_ROLES = new Set(["owner", "manager", "cashier", "accountant"]);

type Size = "58mm" | "80mm" | "a4";
const SIZES: Size[] = ["58mm", "80mm", "a4"];

// Receipts always print Western digits ("en") regardless of UI locale.
function centsMajor(cents: string | bigint, currency: string): string {
  return formatMoney(cents, currency || "USD", "en");
}

function fmtDate(iso: string, locale: "en" | "ar"): string {
  return new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReceiptDoc({
  id,
  locale,
  size,
}: {
  id: string;
  locale: "en" | "ar";
  size: Size;
}) {
  const t = useTranslations("receipt");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const q = useQuery({
    queryKey: ["sale", "receipt", id],
    queryFn: () => receiptDataRequest(id),
  });

  // WebUSB cash-drawer (Slice 3). State machine: undetermined → ready (paired
  // device found on mount) | pair (no paired device yet) | unsupported
  // (no navigator.usb). We auto-pop on cash sales when paired; the user can
  // also click manually.
  type DrawerUiState = "checking" | "unsupported" | "needs_pairing" | "ready" | "kicking" | "kicked" | "error";
  const [drawer, setDrawer] = useState<DrawerUiState>("checking");
  const autoPopFired = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("usb" in navigator)) {
      setDrawer("unsupported");
      return;
    }
    let cancelled = false;
    findPairedPrinter().then((d) => {
      if (cancelled) return;
      setDrawer(d ? "ready" : "needs_pairing");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const triggerKick = async (): Promise<void> => {
    setDrawer("kicking");
    try {
      await popDrawer();
      setDrawer("kicked");
      setTimeout(() => setDrawer("ready"), 1500);
    } catch (err) {
      const code = err instanceof Error ? err.message : "usb_error";
      if (code === "no_printer") setDrawer("needs_pairing");
      else setDrawer("error");
    }
  };

  const pairAndKick = async (): Promise<void> => {
    try {
      await pairPrinter();
      await triggerKick();
    } catch {
      // User cancelled the picker — silently revert.
      setDrawer("needs_pairing");
    }
  };

  // Detect cash receipt without an early return so the effect below is
  // unconditional (React rules of hooks — every render must call the same
  // hooks in the same order).
  const saleFromQuery = q.data?.sale;
  const isCashReceipt = saleFromQuery
    ? saleFromQuery.payment_method === "cash" ||
      (saleFromQuery.payments ?? []).some((p) => p.method === "cash")
    : false;

  // Auto-pop the drawer once per receipt mount when (a) a paired printer is
  // detected and (b) this is a cash receipt. Cashier didn't have to click —
  // matches the printer-DIP-switch UX, but in software.
  useEffect(() => {
    if (!isCashReceipt) return;
    if (drawer !== "ready") return;
    if (autoPopFired.current) return;
    autoPopFired.current = true;
    void triggerKick();
    // triggerKick is defined inside the component but stable per-render; the
    // dependency array is intentionally minimal so the effect fires at most
    // once per ready-state transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCashReceipt, drawer]);

  if (q.isPending) {
    return (
      <div className="receipt-shell">
        <p style={{ color: "var(--ink-3)" }}>{t("loading")}</p>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="receipt-shell">
        <p style={{ color: "var(--rose)" }}>{t("errors.loadFailed")}</p>
      </div>
    );
  }

  const data: ReceiptResponse = q.data;
  const { sale, tenant, branch, cashier, customer, bank_account } = data;
  const tenantName = locale === "ar" ? tenant.name_i18n.ar || tenant.name : tenant.name;
  const logoUrl = tenantLogoPublicUrl(tenant.id, tenant.logo_url);
  const branchLabel = branch
    ? `${branch.code} · ${branch.name_i18n[locale] || branch.name_i18n.en}`
    : null;
  const isPaid = sale.payment_status === "paid";
  const isA4 = size === "a4";

  const stamp = (
    <span className={`receipt-stamp ${isPaid ? "" : "receipt-stamp-pending"}`}>
      {isPaid ? t("status.paid") : t("status.pending")}
    </span>
  );

  return (
    <div className="receipt-shell">
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
              <div className="receipt-a4-title">{t("invoice.title")}</div>
              <div className="receipt-meta-row">
                <span>{t("meta.ticket")}</span>
                <strong>{sale.code}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>{t("meta.date")}</span>
                <span>{fmtDate(sale.occurred_at, locale)}</span>
              </div>
              <div className="receipt-meta-row">
                <span>{t("meta.cashier")}</span>
                <span>{cashier?.name ?? "—"}</span>
              </div>
              <div className="receipt-a4-stamp">{stamp}</div>
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
              <div className="receipt-meta-row">
                <span>{t("meta.cashier")}</span>
                <span>{cashier?.name ?? "—"}</span>
              </div>
              <div className="receipt-meta-row">
                <span>{t("meta.date")}</span>
                <span>{fmtDate(sale.occurred_at, locale)}</span>
              </div>
            </div>
          </>
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

        {sale.payment_method === "cash" && sale.cash_tendered_cents && (
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

        {sale.payment_method === "bank_transfer" && bank_account && (
          <section className="receipt-bank">
            <div style={{ fontWeight: 600, marginBottom: "var(--space-1)" }}>{t("bank.heading")}</div>
            <div>
              {t("bank.bankName")}: {bank_account.bank_name}
            </div>
            <div>
              {t("bank.holder")}: {bank_account.account_holder}
            </div>
            {bank_account.iban_last4 && (
              <div>
                {t("bank.iban")}: •••• {bank_account.iban_last4}
              </div>
            )}
          </section>
        )}

        {!isA4 && <div style={{ textAlign: "center" }}>{stamp}</div>}

        <footer className="receipt-footer">
          <p className="receipt-thanks">{t("thanks")}</p>
          <p style={{ marginTop: "var(--space-2)" }}>{t("footer.tagline")}</p>
        </footer>
      </article>

      <div className="no-print">
        <a href={`/${locale}/pos`} className="receipt-back-link">
          {t("buttons.backToPos")}
        </a>
        <button type="button" onClick={() => window.print()}>
          <Printer size={14} strokeWidth={1.5} style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }} />
          {t("buttons.print")}
        </button>
        {sale.payment_status === "paid" && REFUND_ROLES.has(role) && (
          <a href={`/${locale}/sales/${id}/refund`} className="receipt-refund-link">
            <Undo2 size={14} strokeWidth={1.5} style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }} />
            {t("buttons.refund")}
          </a>
        )}
        {drawer !== "unsupported" && (
          <button
            type="button"
            className="receipt-drawer-btn"
            disabled={drawer === "kicking"}
            onClick={() =>
              drawer === "needs_pairing" ? void pairAndKick() : void triggerKick()
            }
          >
            <Banknote size={14} strokeWidth={1.5} style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }} />
            {drawer === "kicking"
              ? t("buttons.popDrawerPending")
              : drawer === "kicked"
                ? t("buttons.popDrawerDone")
                : drawer === "needs_pairing"
                  ? t("buttons.popDrawerPair")
                  : drawer === "error"
                    ? t("buttons.popDrawerRetry")
                    : t("buttons.popDrawer")}
          </button>
        )}
        {SIZES.filter((s) => s !== size).map((s) => (
          <a key={s} href={`?size=${s}`}>
            {s === "58mm"
              ? t("buttons.switch58")
              : s === "80mm"
                ? t("buttons.switch80")
                : t("buttons.switchA4")}
          </a>
        ))}
      </div>
    </div>
  );
}
