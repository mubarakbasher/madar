"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { currencyMinorUnits, majorToMinor, minorToMajor } from "@/lib/currency";
import type { SplitPaymentSlice, SplitMethod } from "./SplitTenderBody";

/**
 * Compose-stage body for "On account" (credit sale).
 *
 * v1 scope: ONE paid-now slice (cash, optional) + the remainder goes
 * on the customer's account. Defaults to paid-now = 0 (full credit). Split
 * tender combined with an on-account remainder is explicitly out of scope for
 * v1 — see task-5-brief.md Step 2.
 *
 * Card is not offered as a "paid now" sub-method in the cashier UI. The
 * `method` state is kept (rather than hardcoding cash inline) so another
 * method can be re-added without restructuring this component.
 */

export function OnAccountBody({
  total_cents,
  currency,
  submitting,
  onSubmit,
}: {
  total_cents: number;
  currency: string;
  submitting: boolean;
  onSubmit: (payload: { paid_payments: SplitPaymentSlice[]; on_account_cents: number }) => void | Promise<void>;
}) {
  const t = useTranslations("pos.payment.onAccount");
  const tSplitMethods = useTranslations("pos.payment.split.methods");

  const [payNow, setPayNow] = useState(false);
  // Cash is the only "paid now" sub-method offered in the cashier UI; kept as
  // state (not a literal) so a future method can be re-added here.
  const [method] = useState<Extract<SplitMethod, "cash">>("cash");
  const [paidCents, setPaidCents] = useState(0);
  const [cashTenderedCents, setCashTenderedCents] = useState(0);

  const fractionDigits = currencyMinorUnits(currency);
  const inputStep = 1 / 10 ** fractionDigits;

  const effectivePaidCents = payNow ? Math.min(paidCents, total_cents) : 0;
  const remainingCents = total_cents - effectivePaidCents;

  const valid = useMemo(() => {
    if (!payNow) return true;
    if (effectivePaidCents <= 0 || effectivePaidCents > total_cents) return false;
    if (cashTenderedCents < effectivePaidCents) return false;
    return true;
  }, [payNow, effectivePaidCents, total_cents, cashTenderedCents]);

  const canSubmit = valid && !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    const paid_payments: SplitPaymentSlice[] = [];
    if (payNow && effectivePaidCents > 0) {
      const slice: SplitPaymentSlice = {
        method,
        amount_cents: effectivePaidCents,
        cash_tendered_cents: cashTenderedCents,
      };
      paid_payments.push(slice);
    }
    void onSubmit({ paid_payments, on_account_cents: remainingCents });
  }

  return (
    <div>
      <div className="kicker" style={{ marginBottom: 10 }}>
        {t("title")}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: 13, color: "var(--ink-2)" }}>
        <input
          type="checkbox"
          checked={payNow}
          onChange={(e) => {
            setPayNow(e.target.checked);
            if (!e.target.checked) {
              setPaidCents(0);
              setCashTenderedCents(0);
            }
          }}
        />
        {t("payNowLabel")}
      </label>

      {payNow && (
        <div
          style={{
            marginTop: "var(--space-3)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius)",
            padding: "var(--space-3)",
            background: "var(--bg-elev)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <label style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500 }}>
            {t("payNowLabel")} · {tSplitMethods("cash")}
          </label>

          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={inputStep}
            value={paidCents === 0 ? "" : minorToMajor(paidCents, currency)}
            onChange={(e) => {
              const raw = e.target.value;
              const parsed = raw === "" ? 0 : majorToMinor(Number(raw), currency);
              setPaidCents(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
            }}
            className="pos-input tnum"
            aria-label={t("payNowLabel")}
          />

          {method === "cash" && (
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={inputStep}
              value={cashTenderedCents === 0 ? "" : minorToMajor(cashTenderedCents, currency)}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw === "" ? 0 : majorToMinor(Number(raw), currency);
                setCashTenderedCents(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
              }}
              className="pos-input tnum"
              placeholder={t("cashTenderedPlaceholder")}
              aria-label={t("cashTenderedPlaceholder")}
            />
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          padding: "var(--space-3)",
          borderRadius: "var(--radius)",
          background: "var(--bg-sunk)",
          border: "1px solid var(--rule)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span className="kicker" style={{ color: "var(--ink)" }}>
          {t("balanceLabel")}
        </span>
        <span className="serif tnum" style={{ fontSize: 22, fontWeight: 500, color: "var(--ink)" }}>
          {minorToMajor(remainingCents, currency).toFixed(fractionDigits)} {currency}
        </span>
      </div>

      <button
        type="button"
        className="pos-btn pos-btn-primary"
        disabled={!canSubmit}
        onClick={handleSubmit}
        style={{ marginTop: "var(--space-4)", width: "100%", justifyContent: "center" }}
      >
        {submitting ? "…" : t("confirm")}
      </button>
    </div>
  );
}
