"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export interface SendToSupplierResult {
  /** Send email — always `true` when confirming with a recipient, `false`
   * when the user picks "Skip sending" because the supplier has no email. */
  send_email: boolean;
}

/**
 * Modal confirmation dialog for "mark as ordered". Two paths:
 *
 *   1. Supplier has `contact_email` → confirm with optional recipient
 *      override and a "Attach PDF (recommended)" checkbox.
 *   2. Supplier has no email → show a banner with a "Skip sending" CTA
 *      that confirms with `send_email=false`.
 *
 * Either way the parent fires the chained `create → order` API call.
 */
export function SendToSupplierDialog({
  open,
  onClose,
  onConfirm,
  supplierName,
  supplierEmail,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: SendToSupplierResult) => void;
  supplierName: string;
  supplierEmail: string | null;
  pending: boolean;
}) {
  const t = useTranslations("purchases.sendDialog");
  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState(supplierEmail ?? "");
  const [attachPdf, setAttachPdf] = useState(true);

  useEffect(() => {
    if (open) {
      setEmail(supplierEmail ?? "");
      setEditingEmail(false);
      setAttachPdf(true);
    }
  }, [open, supplierEmail]);

  if (!open) return null;

  const hasEmail = Boolean(supplierEmail);

  return (
    <div
      className="po-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-send-dialog-title"
      onClick={onClose}
    >
      <div className="po-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="po-send-dialog-title" className="po-modal-title">
          {t("title")}
        </h2>
        <p className="po-modal-body">{t("body", { supplier: supplierName })}</p>

        {hasEmail ? (
          <>
            <div className="po-modal-section">
              <div className="po-field-label">{t("recipient")}</div>
              <div className="po-modal-recipient">
                {editingEmail ? (
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="po-line-input"
                    autoFocus
                  />
                ) : (
                  <span>{email}</span>
                )}
                <button
                  type="button"
                  className="po-btn po-btn-sm po-btn-ghost"
                  onClick={() => setEditingEmail((s) => !s)}
                >
                  {editingEmail ? t("done") : t("edit")}
                </button>
              </div>
            </div>
            <label className="po-checkbox">
              <input
                type="checkbox"
                checked={attachPdf}
                onChange={(e) => setAttachPdf(e.target.checked)}
              />
              {t("attachPdf")}
            </label>

            <div className="po-modal-foot">
              <button
                type="button"
                className="po-btn po-btn-ghost"
                onClick={onClose}
                disabled={pending}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary"
                disabled={pending}
                onClick={() => onConfirm({ send_email: true })}
              >
                {pending ? t("sending") : t("confirm")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="po-banner-warning">
              <strong>{t("noEmail.title")}</strong>
              <div>{t("noEmail.body")}</div>
            </div>
            <div className="po-modal-foot">
              <button
                type="button"
                className="po-btn po-btn-ghost"
                onClick={onClose}
                disabled={pending}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary"
                disabled={pending}
                onClick={() => onConfirm({ send_email: false })}
              >
                {pending ? t("sending") : t("noEmail.skipSending")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
