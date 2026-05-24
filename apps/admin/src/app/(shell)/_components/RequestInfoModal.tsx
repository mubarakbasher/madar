"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

export interface RequestInfoSubmit {
  message: string;
}

export function RequestInfoModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (payload: RequestInfoSubmit) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 500 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ message: trimmed });
    } catch (e) {
      setError((e as Error).message || t("proofs.requestInfo.fallbackError"));
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="request-info-modal-title">
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal-head">
          <h2 id="request-info-modal-title" className="admin-modal-title">
            {t("proofs.requestInfo.title")}
          </h2>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={onCancel}
            disabled={submitting}
            aria-label={t("proofs.requestInfo.cancel")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        <p className="admin-modal-body-text">
          {t("proofs.requestInfo.body")}
        </p>

        <label className="admin-modal-field">
          <span className="admin-modal-label">
            {t("proofs.requestInfo.messageLabel")}
            <span className="admin-modal-label-hint"> ({trimmed.length}/500)</span>
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
            rows={4}
            placeholder={t("proofs.requestInfo.messagePlaceholder")}
            className="admin-modal-textarea"
            maxLength={500}
            autoFocus
          />
        </label>

        {error && (
          <div role="alert" className="admin-modal-error">
            {error}
          </div>
        )}

        <div className="admin-modal-actions">
          <button type="button" className="admin-tb-action" onClick={onCancel} disabled={submitting}>
            {t("proofs.requestInfo.cancel")}
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? t("proofs.requestInfo.submitting") : t("proofs.requestInfo.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
