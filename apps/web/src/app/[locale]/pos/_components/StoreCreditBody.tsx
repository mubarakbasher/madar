"use client";

import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";

/**
 * Store-credit payment body. Mirrors the cash body's structural rhythm:
 *  - kicker
 *  - two info rows (available / after-sale)
 *  - inline confirm button
 *
 * The actual deduction is server-side — completeSale() locks the customer row
 * and writes a `store_credit_ledger` entry inside the sale transaction. The
 * button just calls onSubmit() with no payload.
 */
export function StoreCreditBody({
  total,
  currency,
  balance,
  customerName,
  submitting,
  onSubmit,
}: {
  /** Major-unit total (matches PaymentSheet's prop type). */
  total: number;
  currency: string;
  /** Major-unit balance for display; balance >= total is the green path. */
  balance: number | null;
  customerName: string | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations("pos.payment.storeCredit");

  if (balance === null) {
    return (
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: "var(--bg-sunk)",
          border: "1px solid var(--rule)",
          color: "var(--ink-2)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Wallet size={16} strokeWidth={1.5} />
        {t("tooltipNeedsCustomer")}
      </div>
    );
  }

  const afterSale = balance - total;
  const insufficient = afterSale < 0;

  return (
    <div>
      <div className="kicker" style={{ marginBottom: 8 }}>
        {t("title")}
      </div>

      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: "var(--bg-sunk)",
          border: "1px solid var(--rule)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Row
          label={t("availableLabel", customerName ? { name: customerName } : { name: "" })}
          value={`${Math.round(balance)} ${currency}`}
        />
        <div style={{ height: 1, background: "var(--rule)" }} />
        <Row
          label={t("afterSaleLabel")}
          value={`${Math.round(afterSale)} ${currency}`}
          tone={insufficient ? "danger" : "neutral"}
        />
      </div>

      {insufficient && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--rose-soft)",
            color: "var(--rose)",
            fontSize: 12,
            fontFamily: "var(--sans)",
          }}
        >
          {t("errors.insufficient")}
        </div>
      )}

      <button
        type="button"
        className="pos-btn pos-btn-primary"
        disabled={insufficient || submitting}
        onClick={onSubmit}
        style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
      >
        {submitting ? "…" : t("apply")}
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <span className="kicker" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
      <span
        className="serif tnum"
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: tone === "danger" ? "var(--rose)" : "var(--ink)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
