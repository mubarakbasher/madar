"use client";

import { useState } from "react";
import { X } from "lucide-react";

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
      setError((e as Error).message || "Request failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="request-info-modal-title">
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal-head">
          <h2 id="request-info-modal-title" className="admin-modal-title">
            Request more information
          </h2>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        <p className="admin-modal-body-text">
          Send a message to the tenant asking for clarification. The proof will stay pending.
        </p>

        <label className="admin-modal-field">
          <span className="admin-modal-label">
            Message to tenant
            <span className="admin-modal-label-hint"> ({trimmed.length}/500)</span>
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
            rows={4}
            placeholder="e.g. The transfer reference is not visible in the receipt. Could you upload a clearer image?"
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
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Sending..." : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
