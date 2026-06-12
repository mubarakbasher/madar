"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Coins, Plus, Trash2 } from "lucide-react";
import { currencyMinorUnits, majorToMinor, minorToMajor } from "@/lib/currency";

export type SplitMethod = "cash" | "card" | "store_credit";

export interface SplitPaymentSlice {
  method: SplitMethod;
  amount_cents: number;
  approval_code?: string;
  cash_tendered_cents?: number;
}

export interface SplitTenderCustomer {
  id: string;
  store_credit_balance_cents: number;
}

const MIN_SLICES = 2;
const MAX_SLICES = 8;
const APPROVAL_MIN = 4;
const APPROVAL_MAX = 20;

const METHOD_ICONS: Record<SplitMethod, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  store_credit: Coins,
};

interface SliceState {
  key: string;
  method: SplitMethod;
  amount_cents: number;
  approval_code: string;
  cash_tendered_cents: number;
}

function makeSlice(method: SplitMethod = "cash"): SliceState {
  return {
    key: Math.random().toString(36).slice(2),
    method,
    amount_cents: 0,
    approval_code: "",
    cash_tendered_cents: 0,
  };
}

export function SplitTenderBody({
  total_cents,
  currency,
  customer,
  submitting,
  onSubmit,
}: {
  total_cents: number;
  currency: string;
  customer?: SplitTenderCustomer | null;
  submitting: boolean;
  onSubmit: (payments: SplitPaymentSlice[]) => void | Promise<void>;
}) {
  const t = useTranslations("pos.payment.split");
  const tMethods = useTranslations("pos.payment.split.methods");

  const [slices, setSlices] = useState<SliceState[]>(() => [makeSlice("cash"), makeSlice("card")]);

  // Currency-aware input granularity: KWD steps by 0.001, JPY by 1.
  const fractionDigits = currencyMinorUnits(currency);
  const inputStep = 1 / 10 ** fractionDigits;

  const paidCents = useMemo(
    () => slices.reduce((sum, s) => sum + (Number.isFinite(s.amount_cents) ? s.amount_cents : 0), 0),
    [slices],
  );
  const remainingCents = total_cents - paidCents;

  const storeCreditBalance = customer?.store_credit_balance_cents ?? 0;

  const validity = useMemo(() => {
    if (slices.length < MIN_SLICES) return { ok: false, code: "min_two_slices" as const };
    if (remainingCents !== 0) return { ok: false, code: "remaining_nonzero" as const };
    for (const s of slices) {
      if (s.amount_cents <= 0) return { ok: false, code: "remaining_nonzero" as const };
      if (s.method === "card") {
        const trimmed = s.approval_code.trim();
        if (trimmed.length < APPROVAL_MIN || trimmed.length > APPROVAL_MAX) {
          return { ok: false, code: "remaining_nonzero" as const };
        }
      }
      if (s.method === "cash" && s.cash_tendered_cents < s.amount_cents) {
        return { ok: false, code: "remaining_nonzero" as const };
      }
      if (s.method === "store_credit" && s.amount_cents > storeCreditBalance) {
        return { ok: false, code: "remaining_nonzero" as const };
      }
    }
    return { ok: true as const };
  }, [slices, remainingCents, storeCreditBalance]);

  function updateSlice(key: string, patch: Partial<SliceState>) {
    setSlices((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addSlice() {
    if (slices.length >= MAX_SLICES) return;
    setSlices((prev) => [...prev, makeSlice("cash")]);
  }

  function removeSlice(key: string) {
    setSlices((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
  }

  function handleSubmit() {
    if (!validity.ok || submitting) return;
    const payload: SplitPaymentSlice[] = slices.map((s) => {
      const base: SplitPaymentSlice = { method: s.method, amount_cents: s.amount_cents };
      if (s.method === "card") base.approval_code = s.approval_code.trim();
      if (s.method === "cash") base.cash_tendered_cents = s.cash_tendered_cents;
      return base;
    });
    void onSubmit(payload);
  }

  const canSubmit = validity.ok && !submitting;

  return (
    <div>
      <div className="kicker" style={{ marginBottom: 10 }}>
        {t("title")}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {slices.map((s, index) => {
          const Icon = METHOD_ICONS[s.method];
          const storeCreditDisabled = !customer || storeCreditBalance <= 0;
          return (
            <div
              key={s.key}
              style={{
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius)",
                padding: "var(--space-3)",
                background: "var(--bg-elev)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span
                  className="kicker"
                  style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Icon size={13} strokeWidth={1.5} />
                  {t("sliceLabel", { index: index + 1 })}
                </span>
                {slices.length > 1 && (
                  <button
                    type="button"
                    className="pos-icon-btn"
                    aria-label={t("removeSlice")}
                    onClick={() => removeSlice(s.key)}
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                )}
              </div>

              <label
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-3)",
                  fontWeight: 500,
                }}
              >
                {t("methodLabel")}
              </label>
              <div style={{ display: "flex", gap: "var(--space-1)" }}>
                {(["cash", "card", "store_credit"] as const).map((m) => {
                  const disabled = m === "store_credit" && storeCreditDisabled;
                  return (
                    <button
                      type="button"
                      key={m}
                      disabled={disabled}
                      onClick={() => updateSlice(s.key, { method: m })}
                      title={
                        disabled
                          ? `${tMethods("storeCredit")} · ${minorToMajor(storeCreditBalance, currency)} ${currency}`
                          : undefined
                      }
                      style={{
                        flex: 1,
                        padding: "var(--space-2) 6px",
                        borderRadius: "var(--radius-sm)",
                        border: 0,
                        background: s.method === m ? "var(--bg-sunk)" : "transparent",
                        color: disabled
                          ? "var(--ink-4)"
                          : s.method === m
                            ? "var(--ink)"
                            : "var(--ink-3)",
                        fontWeight: s.method === m ? 500 : 400,
                        fontSize: 12,
                        cursor: disabled ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      {tMethods(m === "store_credit" ? "storeCredit" : m)}
                    </button>
                  );
                })}
              </div>

              <label
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-3)",
                  fontWeight: 500,
                }}
              >
                {t("amountLabel")}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={inputStep}
                value={s.amount_cents === 0 ? "" : minorToMajor(s.amount_cents, currency)}
                onChange={(e) => {
                  const raw = e.target.value;
                  const parsed = raw === "" ? 0 : majorToMinor(Number(raw), currency);
                  updateSlice(s.key, { amount_cents: Number.isFinite(parsed) ? parsed : 0 });
                }}
                className="pos-input tnum"
                aria-label={t("amountLabel")}
              />

              {s.method === "card" && (
                <>
                  <label
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-3)",
                      fontWeight: 500,
                    }}
                  >
                    {t("approvalCodeLabel")}
                  </label>
                  <input
                    value={s.approval_code}
                    onChange={(e) =>
                      updateSlice(s.key, { approval_code: e.target.value.toUpperCase() })
                    }
                    minLength={APPROVAL_MIN}
                    maxLength={APPROVAL_MAX}
                    className="pos-input tnum"
                    autoComplete="off"
                    aria-label={t("approvalCodeLabel")}
                  />
                </>
              )}

              {s.method === "cash" && (
                <>
                  <label
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-3)",
                      fontWeight: 500,
                    }}
                  >
                    {t("tenderedLabel")}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={inputStep}
                    value={s.cash_tendered_cents === 0 ? "" : minorToMajor(s.cash_tendered_cents, currency)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = raw === "" ? 0 : majorToMinor(Number(raw), currency);
                      updateSlice(s.key, {
                        cash_tendered_cents: Number.isFinite(parsed) ? parsed : 0,
                      });
                    }}
                    className="pos-input tnum"
                    aria-label={t("tenderedLabel")}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addSlice}
        disabled={slices.length >= MAX_SLICES}
        className="pos-btn"
        style={{
          width: "100%",
          justifyContent: "center",
          marginTop: 10,
          gap: 6,
        }}
      >
        <Plus size={13} strokeWidth={1.5} />
        {t("addPayment")}
      </button>

      <div
        style={{
          marginTop: 14,
          padding: "var(--space-3)",
          borderRadius: "var(--radius)",
          background: "var(--bg-sunk)",
          border: "1px solid var(--rule)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "var(--space-2)",
          fontSize: 12,
        }}
      >
        <div>
          <div className="kicker">{t("footer.paid")}</div>
          <div className="serif tnum" style={{ fontSize: 16, fontWeight: 500 }}>
            {minorToMajor(paidCents, currency).toFixed(fractionDigits)} {currency}
          </div>
        </div>
        <div>
          <div className="kicker">{t("footer.total")}</div>
          <div className="serif tnum" style={{ fontSize: 16, fontWeight: 500 }}>
            {minorToMajor(total_cents, currency).toFixed(fractionDigits)} {currency}
          </div>
        </div>
        <div>
          <div className="kicker">{t("footer.remaining")}</div>
          <div
            className="serif tnum"
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: remainingCents === 0 ? "var(--sage)" : "var(--rose)",
            }}
          >
            {minorToMajor(remainingCents, currency).toFixed(fractionDigits)} {currency}
          </div>
        </div>
      </div>

      {!validity.ok && (
        <div
          role="status"
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--ink-3)",
            fontFamily: "var(--sans)",
          }}
        >
          {validity.code === "min_two_slices" && t("errors.min_two_slices")}
          {validity.code === "remaining_nonzero" && t("errors.remaining_nonzero")}
        </div>
      )}

      <button
        type="button"
        className="pos-btn pos-btn-primary"
        disabled={!canSubmit}
        onClick={handleSubmit}
        style={{ marginTop: "var(--space-4)", width: "100%", justifyContent: "center" }}
      >
        {submitting ? "…" : t("submit")}
      </button>
    </div>
  );
}
