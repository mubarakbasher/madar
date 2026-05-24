"use client";

import { Check, X, MessageSquare } from "lucide-react";
import type { ProofItem } from "@/lib/api/admin-proofs";
import { t } from "@/lib/i18n";

export function ProofActionBar({
  proof,
  onApprove,
  onReject,
  onRequestInfo,
  busy,
}: {
  proof: ProofItem;
  onApprove: () => void;
  onReject: () => void;
  onRequestInfo?: () => void;
  busy: boolean;
}) {
  if (proof.status === "verified") {
    return (
      <div className="admin-proof-resolved admin-proof-resolved--ok">
        <Check size={14} strokeWidth={2} />
        <div>
          <strong>{t("proofs.resolved.verified")}</strong>
          {proof.verified_at && (
            <span className="admin-proof-resolved-meta">
              {" · "}
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(proof.verified_at))}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (proof.status === "rejected") {
    return (
      <div className="admin-proof-resolved admin-proof-resolved--bad">
        <X size={14} strokeWidth={2} />
        <div>
          <strong>{t("proofs.resolved.rejected")}</strong>
          {proof.rejection_reason && (
            <span className="admin-proof-resolved-meta"> · {proof.rejection_reason}</span>
          )}
        </div>
      </div>
    );
  }

  if (proof.status === "cancelled") {
    return (
      <div className="admin-proof-resolved admin-proof-resolved--neutral">
        {t("proofs.resolved.cancelled")}
      </div>
    );
  }

  return (
    <div className="admin-proof-actions">
      {onRequestInfo && (
        <button type="button" className="admin-tb-action" onClick={onRequestInfo} disabled={busy}>
          <MessageSquare size={14} strokeWidth={1.5} />
          {t("proofs.action.requestInfo")}
        </button>
      )}
      <button type="button" className="admin-btn-danger" onClick={onReject} disabled={busy}>
        {t("proofs.action.reject")}
      </button>
      <button
        type="button"
        className="admin-btn-primary"
        onClick={onApprove}
        disabled={busy}
      >
        {busy ? t("proofs.action.approving") : t("proofs.action.approve")}
      </button>
    </div>
  );
}
