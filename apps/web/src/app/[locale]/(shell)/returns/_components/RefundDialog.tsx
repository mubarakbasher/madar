"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Confirm-refund modal. The supplier-return refund flow is bookkeeping only
 * — no stock movement — so the dialog stays light: optional notes textarea
 * and two CTAs. Backed by `supplierReturnRefundRequest({ notes })`.
 */
export function RefundDialog({
  open,
  onClose,
  onConfirm,
  rmaCode,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (args: { notes?: string }) => void;
  rmaCode: string;
  pending: boolean;
}) {
  const t = useTranslations("returns.refundDialog");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) setNotes("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="rma-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rma-refund-dialog-title"
      onClick={onClose}
    >
      <div className="rma-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="rma-refund-dialog-title" className="rma-modal-title">
          {t("title")}
        </h2>
        <p className="rma-modal-body">{t("body", { code: rmaCode })}</p>

        <label className="rma-field">
          <span className="rma-field-label">{t("notesLabel")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            placeholder={t("notesPlaceholder")}
          />
          <div className="rma-field-hint">{notes.length} / 2000</div>
        </label>

        <div className="rma-modal-foot">
          <button
            type="button"
            className="rma-btn rma-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="rma-btn rma-btn-primary"
            disabled={pending}
            onClick={() => onConfirm({ notes: notes.trim() || undefined })}
          >
            {pending ? t("confirming") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
