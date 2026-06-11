"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Banknote,
  CreditCard,
  Landmark,
  Check,
  Camera,
  FileText,
  Wallet,
  SplitSquareHorizontal,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { majorToMinor, minorToMajor } from "@/lib/currency";
import { CardPaymentBody } from "./CardPaymentBody";
import { StoreCreditBody } from "./StoreCreditBody";
import { SplitTenderBody, type SplitPaymentSlice } from "./SplitTenderBody";

type PaymentMethodId = "cash" | "card" | "tx" | "sc" | "split";

const ACCEPTED_MIMES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

export type PaymentSubmit =
  | { method: "cash"; cash_tendered_cents: number }
  | { method: "card"; approval_code: string }
  | { method: "store_credit" }
  | { method: "split"; payments: SplitPaymentSlice[] }
  | {
      method: "bank_transfer";
      receipt_file: File;
      transfer_reference: string;
      payer_name: string;
    };

const METHOD_ICONS = {
  cash: Banknote,
  card: CreditCard,
  tx: Landmark,
  sc: Wallet,
  split: SplitSquareHorizontal,
} as const;

export interface PaymentSheetCustomer {
  id: string;
  name: string;
  /** Minor units. Null when the customer has no credit (or no customer attached). */
  store_credit_balance_cents: number | null;
}

/**
 * 1.10c+ scope: cash + card + bank transfer + store credit + split.
 * Each non-cash body owns its own submit button; cash uses the bottom row.
 */
export function PaymentSheet({
  total_cents,
  tax,
  taxInclusive,
  currency,
  customer,
  onClose,
  onSubmit,
}: {
  /** Integer minor units — the cart's authoritative total. */
  total_cents: number;
  /** Major units, display only. */
  tax?: number;
  taxInclusive?: boolean;
  currency: string;
  customer?: PaymentSheetCustomer | null;
  onClose: () => void;
  onSubmit: (payment: PaymentSubmit) => Promise<void>;
}) {
  // Major-unit mirror for the cash denomination chips + display.
  const total = minorToMajor(total_cents, currency);
  const t = useTranslations("pos.payment");
  const tMethods = useTranslations("pos.payment.methods");
  const tStoreCredit = useTranslations("pos.payment.storeCredit");
  const tTaxBreakdown = useTranslations("pos.payment.taxBreakdown");
  const tCommon = useTranslations("common");

  const [method, setMethod] = useState<PaymentMethodId>("cash");
  const [stage, setStage] = useState<"compose" | "receipt">("compose");
  const [cashTendered, setCashTendered] = useState(Math.ceil(total / 100) * 100);
  const [receiptRef, setReceiptRef] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [payerName, setPayerName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tUpload = useTranslations("pos.payment.upload");

  const change = cashTendered - total;
  const cashOk = method !== "cash" || cashTendered >= total;
  const transferOk =
    method !== "tx" || (receiptRef.length > 0 && receiptFile !== null && payerName.trim().length > 0);
  // Bottom "Complete sale" button only used for cash + bank transfer.
  const useBottomRow = method === "cash" || method === "tx";
  const canConfirm = useBottomRow && cashOk && transferOk && !submitting;

  const storeCreditMinor = customer?.store_credit_balance_cents ?? null;
  const totalMinor = total_cents;
  const storeCreditOk =
    customer != null && storeCreditMinor != null && storeCreditMinor >= totalMinor;
  const storeCreditDisabled = !storeCreditOk;
  const storeCreditTooltip = !customer
    ? tStoreCredit("tooltipNeedsCustomer")
    : !storeCreditOk
      ? tStoreCredit("errors.insufficient")
      : undefined;

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED_MIMES.has(file.type)) {
      setUploadError(tUpload("invalidType"));
      setReceiptFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError(tUpload("fileTooLarge"));
      setReceiptFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setReceiptFile(file);
  }

  async function dispatchSubmit(payment: PaymentSubmit) {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(payment);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}`);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Sale failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (method === "cash") {
      await dispatchSubmit({
        method: "cash",
        cash_tendered_cents: majorToMinor(cashTendered, currency),
      });
    } else if (method === "tx") {
      if (!receiptFile) {
        setError(tUpload("pickReceipt"));
        return;
      }
      await dispatchSubmit({
        method: "bank_transfer",
        receipt_file: receiptFile,
        transfer_reference: receiptRef,
        payer_name: payerName.trim(),
      });
    }
  }

  return (
    <div className="pos-modal-bg" onClick={onClose}>
      <div className="pos-modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
        <header className="pos-modal-head">
          <div style={{ flex: 1 }}>
            <span className="kicker">{t("kicker", { id: "2848" })}</span>
            <div
              className="serif tnum"
              style={{ fontSize: 42, fontWeight: 500, marginTop: 4, letterSpacing: "-0.025em", lineHeight: 1 }}
            >
              <span style={{ fontSize: "0.5em", color: "var(--ink-3)", marginInlineEnd: 4 }}>
                {currency === "EGP" ? "£" : currency}
              </span>
              {Math.round(total)}
            </div>
            {tax !== undefined && tax > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  marginTop: 6,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  fontFamily: "var(--sans)",
                }}
              >
                <span className="kicker">{tTaxBreakdown("label")}</span>
                <span className="tnum">
                  {taxInclusive ? "incl. " : "+ "}
                  {Math.round(tax)} {currency}
                </span>
                <span style={{ color: "var(--ink-4)" }}>·</span>
                <span style={{ color: "var(--ink-4)" }}>
                  {taxInclusive ? tTaxBreakdown("inclusiveHint") : tTaxBreakdown("exclusiveHint")}
                </span>
              </div>
            )}
          </div>
          <button type="button" className="pos-icon-btn" onClick={onClose} aria-label={tCommon("close")}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </header>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {stage === "compose" && (
            <>
              <div className="kicker" style={{ marginBottom: 10 }}>
                {t("splitAcross")}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "var(--bg-sunk)",
                  padding: 3,
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                {(["cash", "card", "tx", "sc", "split"] as const).map((m) => {
                  const Ico = METHOD_ICONS[m];
                  const disabled = m === "sc" && storeCreditDisabled;
                  const tooltip = m === "sc" ? storeCreditTooltip : undefined;
                  return (
                    <button
                      type="button"
                      key={m}
                      disabled={disabled}
                      onClick={() => !disabled && setMethod(m)}
                      title={tooltip}
                      style={{
                        flex: 1,
                        padding: "10px 6px",
                        borderRadius: 6,
                        border: 0,
                        background: method === m ? "var(--bg-elev)" : "transparent",
                        color: disabled
                          ? "var(--ink-4)"
                          : method === m
                            ? "var(--ink)"
                            : "var(--ink-3)",
                        fontWeight: method === m ? 500 : 400,
                        fontSize: 12,
                        cursor: disabled ? "not-allowed" : "pointer",
                        boxShadow: method === m ? "var(--shadow-sm)" : "none",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        fontFamily: "inherit",
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <Ico size={13} strokeWidth={1.5} />
                      {tMethods(
                        m === "tx"
                          ? "transfer"
                          : m === "sc"
                            ? "storeCredit"
                            : m === "split"
                              ? "split"
                              : m,
                      )}
                    </button>
                  );
                })}
              </div>

              {method === "cash" && (
                <div>
                  <div className="kicker" style={{ marginBottom: 6 }}>
                    {t("cashTendered")}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { v: total, l: t("exact") },
                      { v: Math.ceil(total / 50) * 50, l: "↑50" },
                      { v: Math.ceil(total / 100) * 100, l: "↑100" },
                      { v: 200, l: "200" },
                      { v: 500, l: "500" },
                    ]
                      .filter((c) => c.v >= total)
                      .map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          className="pos-chip"
                          aria-pressed={cashTendered === c.v}
                          onClick={() => setCashTendered(c.v)}
                        >
                          {c.l}
                          <span className="tnum" style={{ color: "var(--ink-3)", marginInlineStart: 4 }}>
                            {c.v} {currency}
                          </span>
                        </button>
                      ))}
                  </div>
                  {change > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 8,
                        background: "var(--sage-soft)",
                        color: "var(--sage)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span className="kicker" style={{ color: "var(--sage)" }}>
                        {t("changeDueLabel")}
                      </span>
                      <span className="serif tnum" style={{ fontSize: 22, fontWeight: 500 }}>
                        {change} {currency}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {method === "card" && (
                <CardPaymentBody
                  submitting={submitting}
                  onSubmit={(approval_code) =>
                    dispatchSubmit({ method: "card", approval_code })
                  }
                />
              )}

              {method === "sc" && (
                <StoreCreditBody
                  total={total}
                  currency={currency}
                  balance={
                    storeCreditMinor != null ? minorToMajor(storeCreditMinor, currency) : null
                  }
                  customerName={customer?.name ?? null}
                  submitting={submitting}
                  onSubmit={() => void dispatchSubmit({ method: "store_credit" })}
                />
              )}

              {method === "split" && (
                <SplitTenderBody
                  total_cents={totalMinor}
                  currency={currency}
                  customer={
                    customer
                      ? {
                          id: customer.id,
                          store_credit_balance_cents:
                            storeCreditMinor ?? 0,
                        }
                      : null
                  }
                  submitting={submitting}
                  onSubmit={(payments) => dispatchSubmit({ method: "split", payments })}
                />
              )}

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--rose-soft)",
                    color: "var(--rose)",
                    fontSize: 12,
                    fontFamily: "var(--sans)",
                  }}
                >
                  {error}
                </div>
              )}

              {useBottomRow && (
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    className="pos-btn"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={onClose}
                  >
                    {tCommon("cancel")}
                  </button>
                  <button
                    type="button"
                    className="pos-btn pos-btn-primary"
                    disabled={!canConfirm}
                    onClick={() => {
                      if (method === "tx") {
                        setStage("receipt");
                      } else {
                        void handleConfirm();
                      }
                    }}
                    style={{ flex: 2, justifyContent: "center" }}
                  >
                    {method === "tx" ? t("continueToReceipt") : submitting ? "…" : t("completeSale")}
                  </button>
                </div>
              )}
            </>
          )}

          {stage === "receipt" && (
            <>
              <div className="kicker" style={{ marginBottom: 4 }}>
                {t("bankReceiptTitle")}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-2)",
                  marginTop: 0,
                  lineHeight: 1.55,
                  textWrap: "pretty" as const,
                }}
              >
                {t("bankReceiptBody")}
              </p>

              <label
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-3)",
                  display: "block",
                  marginTop: 12,
                  marginBottom: 4,
                  fontWeight: 500,
                }}
              >
                {t("transactionRef")}
              </label>
              <input
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder={t("transactionRefPlaceholder")}
                className="pos-input tnum"
              />

              <label
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-3)",
                  display: "block",
                  marginTop: 12,
                  marginBottom: 4,
                  fontWeight: 500,
                }}
              >
                {tUpload("payerName")}
              </label>
              <input
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder={tUpload("payerNamePlaceholder")}
                className="pos-input"
              />

              <div style={{ marginTop: 12 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleFilePick}
                  style={{ display: "none" }}
                  aria-label={tUpload("pickReceipt")}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: "100%",
                    padding: 16,
                    borderRadius: 10,
                    border: receiptFile
                      ? "1.5px solid var(--sage)"
                      : "1.5px dashed var(--rule)",
                    background: receiptFile
                      ? "color-mix(in oklab, var(--sage-soft) 60%, var(--bg))"
                      : "var(--bg-sunk)",
                    color: receiptFile ? "var(--sage)" : "var(--ink-3)",
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontFamily: "inherit",
                  }}
                >
                  {receiptFile ? (
                    <>
                      {receiptFile.type === "application/pdf" ? (
                        <FileText size={16} strokeWidth={1.5} />
                      ) : (
                        <Check size={16} strokeWidth={1.5} />
                      )}{" "}
                      {receiptFile.name} · {tUpload("replaceReceipt")}
                    </>
                  ) : (
                    <>
                      <Camera size={16} strokeWidth={1.5} /> {tUpload("pickReceipt")}
                    </>
                  )}
                </button>
                {uploadError && (
                  <div
                    role="alert"
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "var(--rose)",
                      fontFamily: "var(--sans)",
                    }}
                  >
                    {uploadError}
                  </div>
                )}
              </div>

              <div
                style={{
                  background: "var(--bg-sunk)",
                  border: "1px solid var(--rule)",
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 12,
                  display: "flex",
                  gap: 10,
                  fontSize: 12,
                  color: "var(--ink-2)",
                }}
              >
                <Landmark size={14} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>{t("pendingNotice")}</div>
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--rose-soft)",
                    color: "var(--rose)",
                    fontSize: 12,
                    fontFamily: "var(--sans)",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="pos-btn"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => setStage("compose")}
                  disabled={submitting}
                >
                  {tCommon("back")}
                </button>
                <button
                  type="button"
                  className="pos-btn pos-btn-primary"
                  disabled={!transferOk || submitting}
                  onClick={() => void handleConfirm()}
                  style={{ flex: 2, justifyContent: "center" }}
                >
                  {submitting ? "…" : `${t("saveSale")} · ${t("pendingVerification")}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
