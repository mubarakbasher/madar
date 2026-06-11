"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import {
  approvePaymentProof,
  getPaymentProof,
  rejectPaymentProof,
} from "@/lib/api/payment-proofs";
import { useAuthStore } from "@/lib/auth/store";
import {
  currencyMinorUnits,
  formatMoney as formatMoneyIntl,
  minorToMajor,
} from "@/lib/currency";
import { MatchIndicators } from "../_components/MatchIndicators";
import { ProofActionBar } from "../_components/ProofActionBar";
import { ReceiptViewer } from "../_components/ReceiptViewer";
import { RejectModal, type RejectSubmit } from "../_components/RejectModal";
import "../verification.css";

const VERIFIER_ROLES = new Set(["owner", "manager"]);

function formatMoney(cents: string, currency: string, locale: string): string {
  const code = currency || "EGP";
  try {
    return formatMoneyIntl(cents, code, locale);
  } catch {
    return `${minorToMajor(cents, code).toFixed(currencyMinorUnits(code))} ${currency}`;
  }
}

export function ProofDetailClient({ proofId }: { proofId: string }) {
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const t = useTranslations("verification");
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const hasAccess = user ? VERIFIER_ROLES.has(user.role) : true;

  const [rejecting, setRejecting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const detailQuery = useQuery({
    queryKey: ["payment-proofs", "detail", proofId],
    queryFn: () => getPaymentProof(proofId),
    staleTime: 30_000,
    enabled: hasAccess,
  });

  async function handleApprove() {
    if (!detailQuery.data) return;
    setActionBusy(true);
    try {
      await approvePaymentProof(proofId);
      await queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      setToast({
        text: `${t("toast.verified")} · ${formatMoney(detailQuery.data.amount_cents, detailQuery.data.currency_code, locale)}`,
        tone: "ok",
      });
    } catch (err) {
      setToast({
        text:
          err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message ?? t("errors.verifyFailed"),
        tone: "bad",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRejectSubmit(payload: RejectSubmit) {
    setActionBusy(true);
    try {
      await rejectPaymentProof(proofId, payload.rejection_reason, payload.notes);
      await queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      setRejecting(false);
      setToast({ text: `${t("toast.rejected")} · ${payload.rejection_reason}`, tone: "bad" });
    } finally {
      setActionBusy(false);
    }
  }

  if (user && !hasAccess) {
    return (
      <div className="vq-access-denied" role="alert">
        <h1>{t("access.denied")}</h1>
        <p>{t("access.deniedBody")}</p>
      </div>
    );
  }

  if (detailQuery.isPending) {
    return <div className="vq-pane-empty">{t("loadingProof")}</div>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="vq-access-denied" role="alert">
        <h1>{t("errors.loadDetail")}</h1>
        <Link href={`/${locale}/sales/verification`} className="vq-btn-ghost">
          {t("actions.back")}
        </Link>
      </div>
    );
  }

  const p = detailQuery.data;

  return (
    <>
      <header className="vq-header">
        <div>
          <Link
            href={`/${locale}/sales/verification`}
            className="vq-kicker"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <ArrowLeft size={12} strokeWidth={2} className="rtl:rotate-180" />
            {t("title")}
          </Link>
          <h1 className="vq-title" style={{ marginTop: 6 }}>
            {p.payer_name}
          </h1>
          <p className="vq-sub" style={{ fontFamily: "var(--mono)" }}>
            {p.id}
          </p>
        </div>
      </header>

      <div className="vq-detail">
        <ReceiptViewer proofId={p.id} />

        <MatchIndicators proof={p} />

        <dl className="vq-detail-grid">
          <dt>{t("detail.amount")}</dt>
          <dd>{formatMoney(p.amount_cents, p.currency_code, locale)}</dd>
          <dt>{t("detail.context")}</dt>
          <dd style={{ textTransform: "capitalize" }}>{p.context}</dd>
          <dt>{t("detail.transferDate")}</dt>
          <dd>{p.transfer_date}</dd>
          <dt>{t("detail.bankRef")}</dt>
          <dd>{p.transfer_reference ?? "—"}</dd>
          <dt>{t("detail.payerBank")}</dt>
          <dd>{p.payer_bank ?? "—"}</dd>
          <dt>{t("detail.submittedAt")}</dt>
          <dd>
            {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(p.created_at))}
          </dd>
        </dl>

        <ProofActionBar proof={p} busy={actionBusy} onApprove={handleApprove} onReject={() => setRejecting(true)} />
      </div>

      {rejecting && <RejectModal onCancel={() => setRejecting(false)} onSubmit={handleRejectSubmit} />}

      {toast && (
        <div role="status" className={`vq-toast vq-toast--${toast.tone}`}>
          {toast.text}
        </div>
      )}
    </>
  );
}
