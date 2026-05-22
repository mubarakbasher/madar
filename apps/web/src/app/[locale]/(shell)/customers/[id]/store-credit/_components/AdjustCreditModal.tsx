"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  customerStoreCreditAdjustRequest,
  type ApiStoreCreditSummary,
} from "@/lib/api/customers";
import { ApiError } from "@/lib/api/client";

type AdjustError =
  | "insufficient_balance"
  | "currency_mismatch"
  | "validation_failed"
  | "forbidden"
  | "amount_zero"
  | "generic";

function mapErrorCode(code: string): AdjustError {
  switch (code) {
    case "insufficient_balance":
    case "currency_mismatch":
    case "validation_failed":
    case "amount_zero":
      return code;
    case "forbidden_role":
    case "forbidden_during_impersonation":
      return "forbidden";
    default:
      return "generic";
  }
}

export function AdjustCreditModal({
  customerId,
  currencyCode,
  onClose,
  onSuccess,
}: {
  customerId: string;
  /** Locked currency from the customer; null on first credit (we'll send the field). */
  currencyCode: string | null;
  onClose: () => void;
  onSuccess: (summary: ApiStoreCreditSummary) => void;
}) {
  const t = useTranslations("customers.storeCredit.modal");
  const tErr = useTranslations("customers.storeCredit.errors");
  const tCommon = useTranslations("common");
  const qc = useQueryClient();

  const [amount, setAmount] = useState("");
  const [noteEn, setNoteEn] = useState("");
  const [noteAr, setNoteAr] = useState("");
  const [currency, setCurrency] = useState(currencyCode ?? "");
  const [error, setError] = useState<AdjustError | null>(null);

  const adjust = useMutation({
    mutationFn: () =>
      customerStoreCreditAdjustRequest(customerId, {
        amount_minor: amount.trim(),
        // Send the currency on first credit only; afterwards the server uses
        // the locked value and we only send it as a sanity match if known.
        ...(currency ? { currency_code: currency.trim().toUpperCase() } : {}),
        note_i18n: { en: noteEn.trim(), ar: noteAr.trim() },
      }),
    onSuccess: (summary) => {
      void qc.invalidateQueries({ queryKey: ["customers", "store-credit", customerId] });
      onSuccess(summary);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setError(mapErrorCode(e.code));
      } else {
        setError("generic");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!amount.trim() || !noteEn.trim() || !noteAr.trim()) {
      setError("validation_failed");
      return;
    }
    if (!/^-?\d+$/.test(amount.trim())) {
      setError("validation_failed");
      return;
    }
    if (amount.trim() === "0" || amount.trim() === "-0") {
      setError("amount_zero");
      return;
    }
    if (!currencyCode && !currency.trim()) {
      setError("validation_failed");
      return;
    }
    adjust.mutate();
  };

  return (
    <div className="sc-modal-bg" onClick={onClose}>
      <form
        className="sc-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <header className="sc-modal-head">
          <h2 className="sc-modal-title">{t("title")}</h2>
        </header>

        <div className="sc-modal-body">
          <div className="sc-field">
            <label className="sc-field-label" htmlFor="sc-amount">
              {t("fields.amountSigned")}
            </label>
            <input
              id="sc-amount"
              className="sc-input tnum"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 2500 or -1000"
            />
          </div>

          {!currencyCode && (
            <div className="sc-field">
              <label className="sc-field-label" htmlFor="sc-currency">
                {t("fields.currency") /* added below in i18n */}
              </label>
              <input
                id="sc-currency"
                className="sc-input"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
              />
            </div>
          )}

          <div className="sc-field">
            <label className="sc-field-label" htmlFor="sc-note-en">
              {t("fields.noteEn")}
            </label>
            <textarea
              id="sc-note-en"
              className="sc-textarea"
              value={noteEn}
              onChange={(e) => setNoteEn(e.target.value)}
            />
          </div>

          <div className="sc-field">
            <label className="sc-field-label" htmlFor="sc-note-ar">
              {t("fields.noteAr")}
            </label>
            <textarea
              id="sc-note-ar"
              className="sc-textarea"
              dir="rtl"
              value={noteAr}
              onChange={(e) => setNoteAr(e.target.value)}
            />
          </div>

          {error && (
            <div role="alert" className="sc-form-error">
              {tErr(error)}
            </div>
          )}
        </div>

        <div className="sc-modal-actions">
          <button
            type="button"
            className="sc-btn"
            onClick={onClose}
            disabled={adjust.isPending}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            className="sc-btn sc-btn-primary"
            disabled={adjust.isPending}
          >
            {adjust.isPending ? "…" : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
