"use client";

import { X } from "lucide-react";

/**
 * Lightweight confirm dialog for resend / deactivate / reactivate flows. The
 * parent owns the request; we only render copy and route Cancel/Confirm clicks.
 * `tone='danger'` paints the Confirm button rose for destructive actions
 * (deactivate); `tone='primary'` (default) for accent.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmCls =
    tone === "danger" ? "usr-btn usr-btn-danger" : "usr-btn usr-btn-primary";

  return (
    <div
      role="dialog"
      aria-modal
      className="usr-modal-backdrop"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="usr-modal"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="usr-modal-head">
          <h2 className="usr-modal-title">{title}</h2>
          <button
            type="button"
            className="usr-modal-close"
            onClick={onCancel}
            disabled={busy}
            aria-label={cancelLabel}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <div className="usr-modal-body">
          <p className="usr-modal-note">{body}</p>
          {error && <div className="usr-general-error">{error}</div>}
        </div>
        <div className="usr-modal-foot">
          <button
            type="button"
            className="usr-btn usr-btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmCls}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
