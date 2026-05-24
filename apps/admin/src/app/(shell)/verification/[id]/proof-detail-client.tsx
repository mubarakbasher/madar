"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApproveProof,
  adminGetProof,
  adminRejectProof,
  adminRequestProofInfo,
} from "@/lib/api/admin-proofs";
import { ApiError } from "@/lib/api/client";
import { MatchIndicators } from "../../_components/MatchIndicators";
import { ProofActionBar } from "../../_components/ProofActionBar";
import { ReceiptViewer } from "../../_components/ReceiptViewer";
import { RejectModal, type RejectSubmit } from "../../_components/RejectModal";
import { RequestInfoModal, type RequestInfoSubmit } from "../../_components/RequestInfoModal";

function formatMoney(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

export function ProofDetailClient({ proofId }: { proofId: string }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const detailQuery = useQuery({
    queryKey: ["admin", "proofs", "detail", proofId],
    queryFn: () => adminGetProof(proofId),
    staleTime: 30_000,
  });

  async function handleApprove() {
    if (!detailQuery.data) return;
    setActionBusy(true);
    try {
      await adminApproveProof(proofId);
      await queryClient.invalidateQueries({ queryKey: ["admin", "proofs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "kpi"] });
      setToast({
        text: `Proof verified · ${formatMoney(detailQuery.data.amount_cents, detailQuery.data.currency_code)}`,
        tone: "ok",
      });
    } catch (err) {
      setToast({
        text: err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message,
        tone: "bad",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRejectSubmit(payload: RejectSubmit) {
    setActionBusy(true);
    try {
      await adminRejectProof(proofId, payload.rejection_reason, payload.notes);
      await queryClient.invalidateQueries({ queryKey: ["admin", "proofs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "kpi"] });
      setRejecting(false);
      setToast({ text: `Proof rejected · ${payload.rejection_reason}`, tone: "bad" });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRequestInfoSubmit(payload: RequestInfoSubmit) {
    setActionBusy(true);
    try {
      await adminRequestProofInfo(proofId, payload.message);
      await queryClient.invalidateQueries({ queryKey: ["admin", "proofs"] });
      setRequestingInfo(false);
      setToast({ text: "Info requested from tenant", tone: "ok" });
    } catch (err) {
      setToast({
        text: err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message,
        tone: "bad",
      });
    } finally {
      setActionBusy(false);
    }
  }

  if (detailQuery.isPending) {
    return <div className="admin-vq-pane-empty">Loading proof…</div>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="admin-error" role="alert">
        <p className="admin-error-title">Couldn&apos;t load proof</p>
        <p className="admin-error-body" style={{ marginBottom: 14 }}>
          The proof may have been deleted or you may not have permission.
        </p>
        <Link href="/verification" className="admin-tb-action" style={{ textDecoration: "none" }}>
          Back to queue
        </Link>
      </div>
    );
  }

  const p = detailQuery.data;

  return (
    <>
      <header className="admin-page-header">
        <div>
          <Link
            href="/verification"
            className="admin-kpi-kicker"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <ArrowLeft size={12} strokeWidth={2} />
            Verification queue
          </Link>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            {p.payer_name}
          </h1>
          <p className="admin-page-sub" style={{ fontFamily: "var(--mono)" }}>
            {p.id}
          </p>
        </div>
      </header>

      <div className="admin-vq-detail">
        <ReceiptViewer proofId={p.id} />

        <MatchIndicators proof={p} />

        <dl className="admin-vq-detail-grid">
          <dt>Amount</dt>
          <dd>{formatMoney(p.amount_cents, p.currency_code)}</dd>
          <dt>Context</dt>
          <dd style={{ textTransform: "capitalize" }}>{p.context}</dd>
          <dt>Transfer date</dt>
          <dd>{p.transfer_date}</dd>
          <dt>Bank reference</dt>
          <dd>{p.transfer_reference ?? "—"}</dd>
          <dt>Payer bank</dt>
          <dd>{p.payer_bank ?? "—"}</dd>
          <dt>Account</dt>
          <dd style={{ textTransform: "capitalize" }}>{p.bank_account_kind}</dd>
          <dt>Submitted</dt>
          <dd>
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(p.created_at))}
          </dd>
          <dt>Tenant</dt>
          <dd style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{p.tenant_id}</dd>
        </dl>

        <ProofActionBar
          proof={p}
          busy={actionBusy}
          onApprove={handleApprove}
          onReject={() => setRejecting(true)}
          onRequestInfo={() => setRequestingInfo(true)}
        />
      </div>

      {rejecting && (
        <RejectModal onCancel={() => setRejecting(false)} onSubmit={handleRejectSubmit} />
      )}

      {requestingInfo && (
        <RequestInfoModal onCancel={() => setRequestingInfo(false)} onSubmit={handleRequestInfoSubmit} />
      )}

      {toast && (
        <div role="status" className={`admin-toast admin-toast--${toast.tone}`}>
          {toast.text}
        </div>
      )}
    </>
  );
}
