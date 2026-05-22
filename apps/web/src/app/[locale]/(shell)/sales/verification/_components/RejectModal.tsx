"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface RejectSubmit {
  rejection_reason: string;
  notes?: string;
}

const REASON_IDS = ["amount", "unread", "account", "dup", "fraud", "other"] as const;
type ReasonId = (typeof REASON_IDS)[number];

export function RejectModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (payload: RejectSubmit) => Promise<void>;
}) {
  const t = useTranslations("verification.reject");
  const tActions = useTranslations("verification.actions");
  const [reasonId, setReasonId] = useState<ReasonId | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = reasonId !== "" && !submitting && (reasonId !== "other" || notes.trim().length > 0);

  async function handleSubmit() {
    if (reasonId === "") return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        rejection_reason: t(`reasons.${reasonId}`),
        notes: notes.trim() || undefined,
      });
    } catch (e) {
      setError((e as Error).message || "Reject failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="vq-modal-backdrop" role="dialog" aria-modal="true">
      <div className="vq-modal" onClick={(e) => e.stopPropagation()}>
        <header className="vq-modal-head">
          <h2 className="vq-modal-title">{t("title")}</h2>
          <button
            type="button"
            className="vq-icon-btn"
            onClick={onCancel}
            disabled={submitting}
            aria-label={tActions("cancel")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        <p className="vq-modal-body-text">{t("body")}</p>

        <div className="vq-reject-reasons">
          {REASON_IDS.map((r) => (
            <label key={r} className="vq-reject-reason-row">
              <input
                type="radio"
                name="reject-reason"
                value={r}
                checked={reasonId === r}
                onChange={(e) => setReasonId(e.target.value as ReasonId)}
                disabled={submitting}
              />
              <span>{t(`reasons.${r}`)}</span>
            </label>
          ))}
        </div>

        <label className="vq-modal-field">
          <span className="vq-modal-label">
            {t("notes")} <span className="vq-modal-label-hint">{t("notesHint")}</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={3}
            placeholder={t("notesPlaceholder")}
            className="vq-modal-textarea"
            maxLength={1000}
          />
        </label>

        {error && (
          <div role="alert" className="vq-modal-error">
            {error}
          </div>
        )}

        <div className="vq-modal-actions">
          <button type="button" className="vq-btn-ghost" onClick={onCancel} disabled={submitting}>
            {tActions("cancel")}
          </button>
          <button
            type="button"
            className="vq-btn-danger"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
