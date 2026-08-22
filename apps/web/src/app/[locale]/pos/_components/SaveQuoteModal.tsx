"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { X, FileText } from "lucide-react";
import type { CartLine, CartCustomer } from "./Cart";
import type { ApiProduct } from "@/lib/api/catalog";
import { quotationCreateRequest, type ApiQuotationPayload } from "@/lib/api/quotations";

const MIN_VALID_DAYS = 1;
const MAX_VALID_DAYS = 90;
const DEFAULT_VALID_DAYS = 14;

export function SaveQuoteModal({
  cart,
  customer,
  branchId,
  currency,
  apiProductById,
  onClose,
  onSaved,
}: {
  cart: CartLine[];
  customer: CartCustomer | null;
  branchId: string;
  currency: string;
  apiProductById: Map<string, ApiProduct>;
  onClose: () => void;
  onSaved: (quotation: ApiQuotationPayload) => void;
}) {
  const t = useTranslations("pos.quote");
  const tCommon = useTranslations("common");
  const [validDays, setValidDays] = useState(DEFAULT_VALID_DAYS);
  const [note, setNote] = useState("");

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
    </div>
  );
}
