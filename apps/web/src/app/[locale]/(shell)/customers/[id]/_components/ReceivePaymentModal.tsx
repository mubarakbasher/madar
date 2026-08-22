"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  customerReceivablesSettleRequest,
  type ApiReceivableOpenSale,
  type SettleReceivableMethod,
} from "@/lib/api/customers";
import { ApiError } from "@/lib/api/client";
import { listTenantBankAccounts } from "@/lib/api/tenant-bank-accounts";
import { submitPaymentProof } from "@/lib/api/payment-proofs";
import { useFormat } from "@/lib/i18n/format";
import { currencyMinorUnits, majorToMinor, minorToMajor } from "@/lib/currency";

type SettleError =
  | "sale_not_open"
  | "amount_exceeds_balance"
  | "customer_mismatch"
  | "insufficient_tendered"
  | "approval_code_required"
  | "forbidden_role"
  | "validation_failed"
  | "generic";

function mapErrorCode(code: string): SettleError {
  switch (code) {
    case "sale_not_open":
    case "amount_exceeds_balance":
    case "customer_mismatch":
    case "insufficient_tendered":
    case "approval_code_required":
    case "validation_failed":
      return code;
    case "forbidden_role":
    case "forbidden_during_impersonation":
      return "forbidden_role";
    default:
      return "generic";
  }
}

type Stage = "form" | "proof" | "done";

/** True for a non-empty string of digits representing a positive integer. */
function isPositiveIntString(s: string): boolean {
  return /^\d+$/.test(s) && BigInt(s) > 0n;
}

export function ReceivePaymentModal({
  customerId,
  openSales,
  currencyCode,
  onClose,
  onSuccess,
}: {
  customerId: string;
  openSales: ApiReceivableOpenSale[];
  currencyCode: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("customers.balance.modal");
  const tBalance = useTranslations("customers.balance");
  const tCommon = useTranslations("common");
  const f = useFormat();
  const locale = useLocale();

  // Money inputs take MAJOR-unit strings (e.g. "1.40" EGP) but every value
  // that leaves this component — state, validation, the API payload — stays
  // a MINOR-unit integer string (bigint-safe). currencyCode can briefly be
  // null before the sale/currency loads; "" falls back to 2 decimal places
  // via currencyMinorUnits, same as the rest of the app's null-currency guard.
  const minorUnits = currencyMinorUnits(currencyCode ?? "");

  const [saleId, setSaleId] = useState(openSales[0]?.sale_id ?? "");
  const selectedSale = useMemo(
    () => openSales.find((s) => s.sale_id === saleId) ?? null,
    [openSales, saleId],
  );

  // "card" remains a valid SettleReceivableMethod for the API/history but is
  // not offered as a selectable tab here — only cash and bank transfer.
  const [method, setMethod] = useState<SettleReceivableMethod>("cash");
  const [amount, setAmount] = useState(selectedSale ? selectedSale.balance_due_cents : "");
  const [cashTendered, setCashTendered] = useState("");
  const [error, setError] = useState<SettleError | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [salePaymentId, setSalePaymentId] = useState<string | null>(null);

  // Proof-upload fields (bank transfer only).
  const bankAccountsQ = useQuery({
    queryKey: ["tenant-bank-accounts", "all"],
    queryFn: () => listTenantBankAccounts(),
    enabled: method === "bank_transfer",
    staleTime: 5 * 60_000,
  });
  const [payerName, setPayerName] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [transferDate, setTransferDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [transferReference, setTransferReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  /** Minor-unit integer string -> major-unit display string for an <input>. */
  function toMajorInput(minorStr: string): string {
    if (minorStr === "" || !isPositiveIntString(minorStr)) return "";
    return minorToMajor(BigInt(minorStr), currencyCode ?? "").toFixed(minorUnits);
  }

  /** Major-unit user input -> minor-unit integer string, bigint-safe. */
  function fromMajorInput(raw: string): string {
    if (raw.trim() === "") return "";
    const majorValue = Number(raw);
    if (!Number.isFinite(majorValue) || majorValue < 0) return "";
    const minorValue = majorToMinor(majorValue, currencyCode ?? "");
    return String(Math.max(0, Math.round(minorValue)));
  }

  function pickSale(id: string) {
    setSaleId(id);
    const s = openSales.find((x) => x.sale_id === id);
    setAmount(s ? s.balance_due_cents : "");
  }

  const settle = useMutation({
    mutationFn: () =>
      customerReceivablesSettleRequest(customerId, {
        sale_id: saleId,
        method,
        amount_cents: amount,
        ...(method === "cash" ? { cash_tendered_cents: cashTendered } : {}),
      }),
    onSuccess: (res) => {
      setSalePaymentId(res.sale_payment_id);
      if (method === "bank_transfer") {
        setStage("proof");
      } else {
        onSuccess();
      }
    },
    onError: (e) => {
      if (e instanceof ApiError) setError(mapErrorCode(e.code));
      else setError("generic");
    },
  });

  const proofMutation = useMutation({
    mutationFn: () => {
      if (!receiptFile || !bankAccountId || !selectedSale || !currencyCode) {
        throw new Error("missing_fields");
      }
      return submitPaymentProof({
        context: "sale",
        reference_id: selectedSale.sale_id,
        amount_cents: amount,
        currency_code: currencyCode,
        bank_account_kind: "tenant",
        bank_account_id: bankAccountId,
        payer_name: payerName.trim(),
        transfer_date: transferDate,
        transfer_reference: transferReference.trim(),
        receipt_file: receiptFile,
        // Links this proof to the settlement payment so verification resolves
        // unambiguously when a customer has other unlinked bank-transfer
        // payments on the same sale.
        ...(salePaymentId ? { sale_payment_id: salePaymentId } : {}),
      });
    },
    onSuccess: () => {
      setStage("done");
    },
    onError: (e) => {
      setProofError(e instanceof ApiError ? e.message : t("errors.generic"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!saleId || !isPositiveIntString(amount)) {
      setError("validation_failed");
      return;
    }
    if (
      method === "cash" &&
      (!isPositiveIntString(cashTendered) || BigInt(cashTendered) < BigInt(amount))
    ) {
      setError("insufficient_tendered");
      return;
    }
    settle.mutate();
  };

  const handleProofSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProofError(null);
    if (!payerName.trim() || !bankAccountId || !transferReference.trim() || !receiptFile) {
      setProofError(t("errors.validation_failed"));
      return;
    }
    proofMutation.mutate();
  };

  return (
    <div className="cu-confirm" onClick={onClose}>
      <div className="cu-confirm-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="cu-confirm-title">{t("title")}</div>

        {stage === "form" && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="cu-field">
              <label className="cu-field-label" htmlFor="rp-sale">
                {t("saleLabel")}
              </label>
              <select
                id="rp-sale"
                className="cu-select"
                value={saleId}
                onChange={(e) => pickSale(e.target.value)}
              >
                {openSales.map((s) => (
                  <option key={s.sale_id} value={s.sale_id}>
                    {s.code} — {currencyCode ? f.money(s.balance_due_cents, currencyCode) : s.balance_due_cents}
                  </option>
                ))}
              </select>
            </div>

            <div className="cu-field">
              <label className="cu-field-label" htmlFor="rp-amount">
                {t("amountLabel")}
              </label>
              <input
                id="rp-amount"
                type="number"
                className="cu-input tnum"
                inputMode="decimal"
                min={0}
                step={1 / 10 ** minorUnits}
                value={toMajorInput(amount)}
                onChange={(e) => setAmount(fromMajorInput(e.target.value))}
              />
            </div>

            <div className="cu-field">
              <div className="cu-field-label">{t("methodLabel")}</div>
              <div className="cu-method-tabs" role="tablist">
                {(["cash", "bank_transfer"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={method === m}
                    className="cu-method-tab"
                    onClick={() => setMethod(m)}
                  >
                    {t(`methods.${m}`)}
                  </button>
                ))}
              </div>
            </div>

            {method === "cash" && (
              <div className="cu-field">
                <label className="cu-field-label" htmlFor="rp-tendered">
                  {t("cashTendered")}
                </label>
                <input
                  id="rp-tendered"
                  type="number"
                  className="cu-input tnum"
                  inputMode="decimal"
                  min={0}
                  step={1 / 10 ** minorUnits}
                  value={toMajorInput(cashTendered)}
                  onChange={(e) => setCashTendered(fromMajorInput(e.target.value))}
                />
              </div>
            )}

            {method === "bank_transfer" && (
              <p className="cu-muted" style={{ fontSize: 13, marginBlockStart: 8 }}>
                {t("bankTransferHint")}
              </p>
            )}

            {error && <div className="cu-form-error">{t(`errors.${error}`)}</div>}

            <div className="cu-confirm-footer">
              <button type="button" className="cu-btn" onClick={onClose} disabled={settle.isPending}>
                {tCommon("cancel")}
              </button>
              <button type="submit" className="cu-btn cu-btn-primary" disabled={settle.isPending}>
                {settle.isPending ? "…" : t("submit")}
              </button>
            </div>
          </form>
        )}

        {stage === "proof" && (
          <form onSubmit={handleProofSubmit} noValidate>
            <p className="cu-muted" style={{ fontSize: 13, marginBlockEnd: 12 }}>
              {t("settledAwaitingReceipt")}
            </p>

            <div className="cu-field">
              <label className="cu-field-label" htmlFor="rp-payer">
                {t("payerName")}
              </label>
              <input
                id="rp-payer"
                className="cu-input"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
              />
            </div>

            <div className="cu-field">
              <label className="cu-field-label" htmlFor="rp-bank">
                {t("bankAccount")}
              </label>
              <select
                id="rp-bank"
                className="cu-select"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                <option value="">—</option>
                {bankAccountsQ.data?.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name_i18n[locale as "en" | "ar"] || a.name_i18n.en} — {a.bank_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="cu-field">
              <label className="cu-field-label" htmlFor="rp-tdate">
                {t("transferDate")}
              </label>
              <input
                id="rp-tdate"
                type="date"
                className="cu-input"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>

            <div className="cu-field">
              <label className="cu-field-label" htmlFor="rp-tref">
                {t("transferReference")}
              </label>
              <input
                id="rp-tref"
                className="cu-input"
                value={transferReference}
                onChange={(e) => setTransferReference(e.target.value)}
              />
            </div>

            <div className="cu-field">
              <label className="cu-field-label" htmlFor="rp-receipt">
                {t("receiptFile")}
              </label>
              <input
                id="rp-receipt"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {proofError && <div className="cu-form-error">{proofError}</div>}

            <div className="cu-confirm-footer">
              <button
                type="submit"
                className="cu-btn cu-btn-primary"
                disabled={proofMutation.isPending}
              >
                {proofMutation.isPending ? "…" : t("uploadReceipt")}
              </button>
            </div>
          </form>
        )}

        {stage === "done" && (
          <div>
            <p className="cu-muted">{tBalance("settledToast")}</p>
            <div className="cu-confirm-footer">
              <button type="button" className="cu-btn cu-btn-primary" onClick={onSuccess}>
                {t("done")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
