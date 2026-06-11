"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import {
  approvePaymentProof,
  getPaymentProof,
  listPaymentProofs,
  rejectPaymentProof,
  type ProofItem,
  type ProofStatus,
} from "@/lib/api/payment-proofs";
import { useAuthStore } from "@/lib/auth/store";
import { formatMoney as formatMoneyShared, minorToMajor } from "@/lib/currency";
import { MatchIndicators } from "./_components/MatchIndicators";
import { ProofActionBar } from "./_components/ProofActionBar";
import { ReceiptViewer } from "./_components/ReceiptViewer";
import { RejectModal, type RejectSubmit } from "./_components/RejectModal";
import "./verification.css";

const VERIFIER_ROLES = new Set(["owner", "manager"]);

const STATUSES: Array<ProofStatus | "all"> = ["pending", "verified", "rejected", "all"];

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function daysClass(d: number): string {
  if (d <= 1) return "vq-days--fresh";
  if (d <= 3) return "vq-days--warn";
  return "vq-days--stale";
}

function formatMoney(cents: string, currency: string, locale: string): string {
  try {
    return formatMoneyShared(cents, currency || "EGP", locale);
  } catch {
    return `${minorToMajor(cents, currency || "EGP")} ${currency}`;
  }
}

export function VerificationClient() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get("status") as ProofStatus | "all" | null) ?? "pending";
  const selectedId = searchParams.get("selected") ?? "";
  const t = useTranslations("verification");

  const user = useAuthStore((s) => s.user);
  const hasAccess = user ? VERIFIER_ROLES.has(user.role) : true; // Don't show denied while bootstrap pending

  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  function setQueryParam(key: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value == null || value === "") sp.delete(key);
    else sp.set(key, value);
    router.replace(`/${locale}/sales/verification?${sp.toString()}`, { scroll: false });
  }

  const listQuery = useQuery({
    queryKey: ["payment-proofs", "list", { status: statusParam }],
    queryFn: () =>
      listPaymentProofs({
        context: "sale",
        status: statusParam === "all" ? undefined : statusParam,
        limit: 100,
      }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled: hasAccess,
  });

  const items: ProofItem[] = useMemo(() => {
    const rows = listQuery.data?.items ?? [];
    if (statusParam === "pending") {
      return [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    return rows;
  }, [listQuery.data, statusParam]);

  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setQueryParam("selected", items[0]!.id);
    }
    if (selectedId && items.length > 0 && !items.find((i) => i.id === selectedId)) {
      setQueryParam("selected", items[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId]);

  const detailQuery = useQuery({
    queryKey: ["payment-proofs", "detail", selectedId],
    queryFn: () => getPaymentProof(selectedId),
    enabled: !!selectedId && hasAccess,
    staleTime: 30_000,
  });

  async function handleApprove() {
    if (!detailQuery.data) return;
    setActionBusy(true);
    try {
      await approvePaymentProof(detailQuery.data.id);
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
    if (!detailQuery.data) return;
    setActionBusy(true);
    try {
      await rejectPaymentProof(detailQuery.data.id, payload.rejection_reason, payload.notes);
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

  return (
    <>
      <header className="vq-header">
        <div>
          <span className="vq-kicker">{t("kicker")}</span>
          <h1 className="vq-title" style={{ marginTop: 6 }}>
            {t("title")}
          </h1>
          <p className="vq-sub">{t("subtitle")}</p>
        </div>
      </header>

      <div className="vq-filter-row">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className="vq-chip"
            aria-pressed={statusParam === s}
            onClick={() => {
              setQueryParam("status", s === "pending" ? null : s);
              setQueryParam("selected", null);
            }}
          >
            {t(`filters.${s}` as const)}
          </button>
        ))}
      </div>

      <div className="vq-grid">
        <div className="vq-list">
          {listQuery.isPending && <div className="vq-list-empty">{t("loading")}</div>}
          {listQuery.isError && (
            <div className="vq-list-empty" role="alert">
              {t("errors.loadList")}
            </div>
          )}
          {!listQuery.isPending && !listQuery.isError && items.length === 0 && (
            <div className="vq-list-empty">
              {statusParam === "pending" ? t("empty.pending") : t("empty.completed")}
            </div>
          )}
          {items.map((p) => {
            const days = daysSince(p.created_at);
            return (
              <button
                key={p.id}
                type="button"
                className="vq-row"
                aria-current={p.id === selectedId}
                onClick={() => setQueryParam("selected", p.id)}
              >
                <div className="vq-row-head">
                  <span className="vq-row-payer">{p.payer_name}</span>
                  <span className="vq-row-amount">{formatMoney(p.amount_cents, p.currency_code, locale)}</span>
                </div>
                <div className="vq-row-meta">
                  <span>{p.transfer_reference ?? t("list.noRef")}</span>
                  <span className={`vq-days ${daysClass(days)}`}>
                    {days === 0 ? t("list.today") : t("list.daysPending", { n: days })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="vq-detail">
          {!selectedId && <div className="vq-pane-empty">{t("empty.selectProof")}</div>}
          {selectedId && detailQuery.isPending && (
            <div className="vq-pane-empty">{t("loadingProof")}</div>
          )}
          {selectedId && detailQuery.isError && (
            <div className="vq-pane-empty" role="alert">
              {t("errors.loadDetail")}
            </div>
          )}
          {detailQuery.data && (
            <>
              <div className="vq-detail-head">
                <div>
                  <h2 className="vq-detail-title">{detailQuery.data.payer_name}</h2>
                  <span className="vq-detail-meta">{detailQuery.data.id}</span>
                </div>
                <Link
                  href={`/${locale}/sales/verification/${detailQuery.data.id}`}
                  className="vq-btn-ghost"
                  style={{ textDecoration: "none" }}
                >
                  {t("actions.openDetail")}
                </Link>
              </div>

              <ReceiptViewer proofId={detailQuery.data.id} />

              <MatchIndicators proof={detailQuery.data} />

              <dl className="vq-detail-grid">
                <dt>{t("detail.amount")}</dt>
                <dd>{formatMoney(detailQuery.data.amount_cents, detailQuery.data.currency_code, locale)}</dd>
                <dt>{t("detail.transferDate")}</dt>
                <dd>{detailQuery.data.transfer_date}</dd>
                <dt>{t("detail.bankRef")}</dt>
                <dd>{detailQuery.data.transfer_reference ?? "—"}</dd>
                <dt>{t("detail.payerBank")}</dt>
                <dd>{detailQuery.data.payer_bank ?? "—"}</dd>
                <dt>{t("detail.submittedAt")}</dt>
                <dd>
                  {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(detailQuery.data.created_at))}
                </dd>
              </dl>

              <ProofActionBar
                proof={detailQuery.data}
                busy={actionBusy}
                onApprove={handleApprove}
                onReject={() => setRejecting(true)}
              />
            </>
          )}
        </div>
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
