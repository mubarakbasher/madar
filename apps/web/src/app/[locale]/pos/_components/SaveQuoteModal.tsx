"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, FileText, Printer } from "lucide-react";
import type { CartLine, CartCustomer } from "./Cart";
import type { ApiProduct } from "@/lib/api/catalog";
import { quotationCreateRequest, type ApiQuotationPayload } from "@/lib/api/quotations";
import { businessGetRequest } from "@/lib/api/business";
import { branchesListRequest } from "@/lib/api/branches";
import { listTenantBankAccounts } from "@/lib/api/tenant-bank-accounts";
import type { SaleLineResponse } from "@/lib/api/sales";
import { ReceiptView, type ReceiptViewDoc } from "../../sales/_components/ReceiptView";
import "../../sales/[id]/receipt/receipt.css";

const MIN_VALID_DAYS = 1;
const MAX_VALID_DAYS = 90;
const DEFAULT_VALID_DAYS = 14;
const ESTIMATE_VALID_DAYS = 14;

export function SaveQuoteModal({
  cart,
  customer,
  branchId,
  currency,
  locale,
  apiProductById,
  onClose,
  onSaved,
}: {
  cart: CartLine[];
  customer: CartCustomer | null;
  branchId: string;
  currency: string;
  locale: "en" | "ar";
  apiProductById: Map<string, ApiProduct>;
  onClose: () => void;
  onSaved: (quotation: ApiQuotationPayload) => void;
}) {
  const t = useTranslations("pos.quote");
  const tCommon = useTranslations("common");
  const [validDays, setValidDays] = useState(DEFAULT_VALID_DAYS);
  const [note, setNote] = useState("");
  const [printDoc, setPrintDoc] = useState<ReceiptViewDoc | null>(null);

  const businessQ = useQuery({
    queryKey: ["business", "snapshot"],
    queryFn: () => businessGetRequest(),
    enabled: false,
    staleTime: 60_000,
  });
  const branchesQ = useQuery({
    queryKey: ["branches", "list-for-print"],
    queryFn: () => branchesListRequest(),
    enabled: false,
    staleTime: 60_000,
  });
  const bankQ = useQuery({
    queryKey: ["tenant-bank-accounts", branchId],
    queryFn: () => listTenantBankAccounts({ branch_id: branchId }),
    enabled: false,
    staleTime: 60_000,
  });

  // Print-only portal: on open, park a body-level class so print CSS can hide
  // everything except the portal root, then trigger window.print(). Nothing
  // here is persisted — it's a client-only render of the current cart.
  useEffect(() => {
    if (!printDoc) return;
    document.body.classList.add("pos-printing");
    const t = setTimeout(() => window.print(), 50);
    const onAfterPrint = () => setPrintDoc(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      clearTimeout(t);
      document.body.classList.remove("pos-printing");
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [printDoc]);

  async function handlePrintEstimate() {
    const lines = buildLines();
    if (lines.length === 0) return;
    const subtotalCents = lines.reduce(
      (s, l) => s + BigInt(l.unit_price_cents) * BigInt(l.qty),
      0n,
    );
    const discountCents = lines.reduce((s, l) => s + BigInt(l.discount_cents), 0n);
    const totalCents = subtotalCents - discountCents;

    const [business, branches, bank] = await Promise.all([
      businessQ.data ? Promise.resolve(businessQ.data) : businessQ.refetch().then((r) => r.data),
      branchesQ.data ? Promise.resolve(branchesQ.data) : branchesQ.refetch().then((r) => r.data),
      bankQ.data ? Promise.resolve(bankQ.data) : bankQ.refetch().then((r) => r.data),
    ]);
    if (!business) return;
    const branch = branches?.items.find((b) => b.id === branchId) ?? null;
    const bankAccounts = bank?.items ?? [];
    const bankAccount =
      bankAccounts.find((a) => a.is_default && a.is_active) ??
      bankAccounts.find((a) => a.is_active) ??
      null;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + ESTIMATE_VALID_DAYS);

    const saleLines: SaleLineResponse[] = lines.map((l, idx) => ({
      id: `${l.product_id}-${idx}`,
      product_id: l.product_id,
      sku: apiProductById.get(l.product_id)?.sku ?? "",
      name_i18n: apiProductById.get(l.product_id)?.name_i18n ?? { en: "", ar: "" },
      qty: l.qty,
      unit_price_cents: l.unit_price_cents,
      discount_cents: l.discount_cents,
      tax_cents: "0",
      line_total_cents: (
        BigInt(l.unit_price_cents) * BigInt(l.qty) - BigInt(l.discount_cents)
      ).toString(),
      cogs_snapshot_cents: "0",
      note: l.note,
    }));

    setPrintDoc({
      sale: {
        id: "estimate",
        code: "—",
        branch_id: branchId,
        cashier_id: "",
        customer_id: customer?.id ?? null,
        occurred_at: new Date().toISOString(),
        subtotal_cents: subtotalCents.toString(),
        discount_cents: discountCents.toString(),
        tax_cents: "0",
        total_cents: totalCents.toString(),
        cash_tendered_cents: null,
        change_due_cents: null,
        currency_code: currency,
        payment_method: "cash",
        payment_status: "unpaid",
        approval_code: null,
        client_uuid: "estimate",
        client_occurred_at: null,
        has_negative_stock: false,
        offline_completed: false,
        balance_due_cents: "0",
        lines: saleLines,
        payments: [],
      },
      tenant: {
        id: business.id,
        name: business.name,
        name_i18n: business.name_i18n,
        logo_url: business.logo_url,
        legal_name: business.legal_name,
        tax_registration_number: business.tax_registration_number,
      },
      branch: branch
        ? { code: branch.code, name_i18n: branch.name_i18n, address_i18n: branch.address_i18n }
        : null,
      cashier: null,
      customer: customer ? { name: customer.name } : null,
      bank_account: bankAccount
        ? {
            bank_name: bankAccount.bank_name,
            account_holder: bankAccount.account_holder,
            account_number_last4: bankAccount.account_number_last4,
            iban_last4: bankAccount.iban_last4,
            swift: bankAccount.swift,
          }
        : null,
      quotation: { code: "—", valid_until: validUntil.toISOString() },
    });
  }

  const saveMut = useMutation({
    mutationFn: quotationCreateRequest,
    onSuccess: (quotation) => onSaved(quotation),
  });

  function buildLines() {
    return cart
      .map((line) => {
        const apiProd = apiProductById.get(line.id);
        if (!apiProd) return null;
        const unitCents = BigInt(apiProd.price_cents);
        const grossCents = unitCents * BigInt(line.qty);
        const lineDiscountCents = (grossCents * BigInt(line.discount)) / 100n;
        return {
          product_id: line.id,
          qty: line.qty,
          unit_price_cents: unitCents.toString(),
          discount_cents: lineDiscountCents.toString(),
          note: line.note ? line.note : null,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
  }

  function handleConfirm() {
    if (saveMut.isPending) return;
    const lines = buildLines();
    if (lines.length === 0) return;
    const subtotalCents = lines.reduce(
      (s, l) => s + BigInt(l.unit_price_cents) * BigInt(l.qty),
      0n,
    );
    const discountCents = lines.reduce((s, l) => s + BigInt(l.discount_cents), 0n);
    const totalCents = subtotalCents - discountCents;
    saveMut.mutate({
      branch_id: branchId,
      customer_id: customer?.id ?? null,
      note: note ? note : null,
      currency_code: currency,
      subtotal_cents: subtotalCents.toString(),
      discount_cents: discountCents.toString(),
      tax_cents: "0",
      total_cents: totalCents.toString(),
      valid_days: validDays,
      lines,
    });
  }

  const clampedDays = (v: number) =>
    Math.min(MAX_VALID_DAYS, Math.max(MIN_VALID_DAYS, Math.round(v)));

  return (
    <div className="pos-modal-bg" onClick={onClose} role="dialog" aria-modal>
      <div className="pos-modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <header className="pos-modal-head">
          <div>
            <span className="kicker">{t("modalKicker")}</span>
            <h3 className="serif">{t("modalTitle")}</h3>
          </div>
          <button
            type="button"
            className="pos-icon-btn"
            onClick={onClose}
            aria-label={tCommon("close")}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </header>

        <div style={{ padding: "20px var(--space-5)" }}>
          {customer ? (
            <div style={{ marginBottom: "var(--space-4)", fontSize: 13, color: "var(--ink-2)" }}>
              {t("forCustomer", { name: customer.name })}
            </div>
          ) : (
            <div style={{ marginBottom: "var(--space-4)", fontSize: 13, color: "var(--ink-3)" }}>
              {t("noCustomer")}
            </div>
          )}

          <div className="kicker" style={{ marginBottom: 6 }}>
            {t("validDaysLabel")}
          </div>
          <input
            type="number"
            className="pos-input"
            min={MIN_VALID_DAYS}
            max={MAX_VALID_DAYS}
            value={validDays}
            onChange={(e) => setValidDays(clampedDays(Number(e.target.value) || DEFAULT_VALID_DAYS))}
            style={{ marginBottom: "var(--space-4)" }}
          />

          <div className="kicker" style={{ marginBottom: 6 }}>
            {t("noteLabel")}
          </div>
          <input
            className="pos-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
          />

          {saveMut.isError && (
            <div style={{ marginTop: "var(--space-3)", fontSize: 12, color: "var(--rose)" }}>
              {t("saveError")}
            </div>
          )}
        </div>

        <footer className="pos-modal-foot">
          <button type="button" className="pos-btn" onClick={onClose}>
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            className="pos-btn"
            onClick={() => void handlePrintEstimate()}
            disabled={cart.length === 0}
          >
            <Printer size={12} strokeWidth={1.5} />
            {t("printEstimate")}
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="pos-btn pos-btn-primary"
            onClick={handleConfirm}
            disabled={saveMut.isPending}
          >
            <FileText size={12} strokeWidth={1.5} />
            {saveMut.isPending ? t("saving") : t("save")}
          </button>
        </footer>
      </div>

      {printDoc &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pos-print-portal-root receipt-shell">
            <ReceiptView doc={printDoc} locale={locale} size="80mm" variant="quotation" />
            <div className="no-print">
              <button type="button" onClick={() => setPrintDoc(null)}>
                {tCommon("close")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
