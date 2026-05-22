"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProofItem } from "@/lib/api/payment-proofs";

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
  const t = useTranslations("verification.actions");
  const tRes = useTranslations("verification.resolved");

  if (proof.status === "verified") {
    return (
      <div className="vq-resolved vq-resolved--ok">
        <Check size={14} strokeWidth={2} />
        <div>
          <strong>{tRes("verified")}</strong>
          {proof.verified_at && (
            <span className="vq-resolved-meta">
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
      <div className="vq-resolved vq-resolved--bad">
        <X size={14} strokeWidth={2} />
        <div>
          <strong>{tRes("rejected")}</strong>
          {proof.rejection_reason && (
            <span className="vq-resolved-meta"> · {proof.rejection_reason}</span>
          )}
        </div>
      </div>
    );
  }

  if (proof.status === "cancelled") {
    return <div className="vq-resolved vq-resolved--neutral">{tRes("cancelled")}</div>;
  }

  return (
    <div className="vq-actions">
      <button type="button" className="vq-btn-danger" onClick={onReject} disabled={busy}>
        {t("reject")}
      </button>
      <button type="button" className="vq-btn-primary" onClick={onApprove} disabled={busy}>
        {busy ? t("approving") : t("approve")}
      </button>
    </div>
  );
}
