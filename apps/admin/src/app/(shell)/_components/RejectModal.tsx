"use client";

import { useState } from "react";
import { X } from "lucide-react";

export interface RejectSubmit {
  rejection_reason: string;
  notes?: string;
}

const REJECT_REASONS = [
  { id: "amount", label: "Wrong amount transferred" },
  { id: "unread", label: "Unreadable / blurry receipt" },
  { id: "account", label: "Sent to wrong account" },
  { id: "dup", label: "Duplicate of an earlier proof" },
  { id: "fraud", label: "Suspected fraud / mismatch" },
  { id: "other", label: "Other (explain below)" },
] as const;

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
      setError((e as Error).message || "Reject failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reject-modal-title">
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal-head">
          <h2 id="reject-modal-title" className="admin-modal-title">
            Reject this proof
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
          Pick a reason. The tenant will be notified and can resubmit a new proof.
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
            Notes <span className="admin-modal-label-hint">(internal — visible to your teammates)</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={3}
            placeholder="Optional context for the audit log"
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
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn-danger"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Rejecting…" : "Reject and notify tenant"}
          </button>
        </div>
      </div>
    </div>
  );
}
