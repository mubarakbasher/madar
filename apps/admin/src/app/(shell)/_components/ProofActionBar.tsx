"use client";

import { Check, X } from "lucide-react";
import type { ProofItem } from "@/lib/api/admin-proofs";

export function ProofActionBar({
  proof,
  onApprove,
  onReject,
  busy,
}: {
  proof: ProofItem;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  if (proof.status === "verified") {
    return (
      <div className="admin-proof-resolved admin-proof-resolved--ok">
        <Check size={14} strokeWidth={2} />
        <div>
          <strong>Verified</strong>
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
          <strong>Rejected</strong>
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
        Cancelled by submitter.
      </div>
    );
  }

  return (
    <div className="admin-proof-actions">
      <button type="button" className="admin-btn-danger" onClick={onReject} disabled={busy}>
        Reject
      </button>
      <button
        type="button"
        className="admin-btn-primary"
        onClick={onApprove}
        disabled={busy}
      >
        {busy ? "Approving…" : "Approve"}
      </button>
    </div>
  );
}
