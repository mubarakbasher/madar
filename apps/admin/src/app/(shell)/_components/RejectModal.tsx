"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

export interface RejectSubmit {
  rejection_reason: string;
  notes?: string;
}

const REJECT_REASONS = [
  { id: "amount", label: t("proofs.reject.reasons.amount") },
  { id: "unread", label: t("proofs.reject.reasons.unread") },
  { id: "account", label: t("proofs.reject.reasons.account") },
  { id: "dup", label: t("proofs.reject.reasons.dup") },
  { id: "fraud", label: t("proofs.reject.reasons.fraud") },
  { id: "other", label: t("proofs.reject.reasons.other") },
];

export function RejectModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (payload: RejectSubmit) => Promise<void>;
}) {
  const [reasonId, setReasonId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = REJECT_REASONS.find((r) => r.id === reasonId);
  const canSubmit = !!selected && !submitting && (reasonId !== "other" || notes.trim().length > 0);

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        rejection_reason: selected.label,
        notes: notes.trim() || undefined,
      });
    } catch (e) {
      setError((e as Error).message || t("proofs.reject.fallbackError"));
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reject-modal-title">
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal-head">
          <h2 id="reject-modal-title" className="admin-modal-title">
            {t("proofs.reject.title")}
          </h2>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={onCancel}
            disabled={submitting}
            aria-label={t("proofs.reject.cancel")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        <p className="admin-modal-body-text">
          {t("proofs.reject.body")}
        </p>

        <div className="admin-reject-reasons">
          {REJECT_REASONS.map((r) => (
            <label key={r.id} className="admin-reject-reason-row">
              <input
                type="radio"
                name="reject-reason"
                value={r.id}
                checked={reasonId === r.id}
                onChange={(e) => setReasonId(e.target.value)}
                disabled={submitting}
              />
              <span>{r.label}</span>
            </label>
          ))}
        </div>

        <label className="admin-modal-field">
          <span className="admin-modal-label">
            {t("proofs.reject.notesLabel")} <span className="admin-modal-label-hint">{t("proofs.reject.notesHint")}</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={3}
            placeholder={t("proofs.reject.notesPlaceholder")}
            className="admin-modal-textarea"
            maxLength={1000}
          />
        </label>

        {error && (
          <div role="alert" className="admin-modal-error">
            {error}
          </div>
        )}

        <div className="admin-modal-actions">
          <button type="button" className="admin-tb-action" onClick={onCancel} disabled={submitting}>
            {t("proofs.reject.cancel")}
          </button>
          <button
            type="button"
            className="admin-btn-danger"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? t("proofs.reject.submitting") : t("proofs.reject.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
