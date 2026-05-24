"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  adminApproveProof,
  adminGetProof,
  adminListProofs,
  adminRejectProof,
  adminRequestProofInfo,
  type ProofItem,
  type ProofStatus,
} from "@/lib/api/admin-proofs";
import { ApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n";
import { MatchIndicators } from "../_components/MatchIndicators";
import { ProofActionBar } from "../_components/ProofActionBar";
import { ReceiptViewer } from "../_components/ReceiptViewer";
import { RejectModal, type RejectSubmit } from "../_components/RejectModal";
import { RequestInfoModal, type RequestInfoSubmit } from "../_components/RequestInfoModal";

const STATUSES: Array<{ value: ProofStatus | "all"; label: string }> = [
  { value: "pending", label: t("verification.statuses.pending") },
  { value: "verified", label: t("verification.statuses.verified") },
  { value: "rejected", label: t("verification.statuses.rejected") },
  { value: "all", label: t("verification.statuses.all") },
];

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function daysClass(d: number): string {
  if (d <= 1) return "admin-vq-days--fresh";
  if (d <= 3) return "admin-vq-days--warn";
  return "admin-vq-days--stale";
}

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

export function VerificationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get("status") as ProofStatus | "all" | null) ?? "pending";
  const selectedId = searchParams.get("selected") ?? "";
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [requestingInfo, setRequestingInfo] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function setQueryParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
    router.replace(`/verification?${params.toString()}`, { scroll: false });
  }

  const listQuery = useQuery({
    queryKey: ["admin", "proofs", "list", { status: statusParam }],
    queryFn: () =>
      adminListProofs({
        context: "subscription",
        status: statusParam === "all" ? undefined : statusParam,
        limit: 100,
      }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  // Client-side sort for pending: server returns DESC; flip to oldest-first.
  const items: ProofItem[] = useMemo(() => {
    const rows = listQuery.data?.items ?? [];
    if (statusParam === "pending") {
      return [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    return rows;
  }, [listQuery.data, statusParam]);

  // Auto-select first item if URL has no selection.
  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setQueryParam("selected", items[0]!.id);
    }
    // If selected falls off the filtered list (after action / filter change), pick the next one.
    if (selectedId && items.length > 0 && !items.find((i) => i.id === selectedId)) {
      setQueryParam("selected", items[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId]);

  const detailQuery = useQuery({
    queryKey: ["admin", "proofs", "detail", selectedId],
    queryFn: () => adminGetProof(selectedId),
    enabled: !!selectedId,
    staleTime: 30_000,
  });

  const [actionBusy, setActionBusy] = useState(false);

  async function handleApprove() {
    if (!detailQuery.data) return;
    setActionBusy(true);
    try {
      await adminApproveProof(detailQuery.data.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "proofs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "kpi"] });
      setToast({ text: `Proof verified · ${formatMoney(detailQuery.data.amount_cents, detailQuery.data.currency_code)}`, tone: "ok" });
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
    if (!detailQuery.data) return;
    setActionBusy(true);
    try {
      await adminRejectProof(detailQuery.data.id, payload.rejection_reason, payload.notes);
      await queryClient.invalidateQueries({ queryKey: ["admin", "proofs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "kpi"] });
      setRejecting(false);
      setToast({ text: `Proof rejected · ${payload.rejection_reason}`, tone: "bad" });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRequestInfoSubmit(payload: RequestInfoSubmit) {
    if (!detailQuery.data) return;
    setActionBusy(true);
    try {
      await adminRequestProofInfo(detailQuery.data.id, payload.message);
      await queryClient.invalidateQueries({ queryKey: ["admin", "proofs"] });
      setRequestingInfo(false);
      setToast({ text: t("verification.toast.infoRequested"), tone: "ok" });
    } catch (err) {
      setToast({
        text: err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message,
        tone: "bad",
      });
    } finally {
      setActionBusy(false);
    }
  }

  // Keyboard shortcuts (J/K/A/R per docs/0002-bank-transfer-payments.md §43).
  // Skip when focus is in a form field — typing a rejection note should not
  // trigger Approve. The reject modal owns its own keydown handling.
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (rejecting || requestingInfo || actionBusy) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        if (items.length === 0) return;
        const idx = items.findIndex((p) => p.id === selectedId);
        let nextIdx: number;
        if (idx < 0) nextIdx = 0;
        else if (key === "j") nextIdx = Math.min(items.length - 1, idx + 1);
        else nextIdx = Math.max(0, idx - 1);
        const next = items[nextIdx];
        if (next && next.id !== selectedId) {
          e.preventDefault();
          setQueryParam("selected", next.id);
        }
      } else if (key === "a") {
        if (detailQuery.data && detailQuery.data.status === "pending") {
          e.preventDefault();
          void handleApprove();
        }
      } else if (key === "r") {
        if (detailQuery.data && detailQuery.data.status === "pending") {
          e.preventDefault();
          setRejecting(true);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId, detailQuery.data, rejecting, requestingInfo, actionBusy]);

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">{t("verification.kicker")}</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            {t("verification.title")}
          </h1>
          <p className="admin-page-sub">
            {listQuery.data
              ? `${listQuery.data.total} ${statusParam === "all" ? "total" : statusParam} · subscription proofs only`
              : t("common.loading")}
            <span style={{ marginInlineStart: 12, opacity: 0.65 }}>
              {t("verification.keyboard")} <kbd>J</kbd>/<kbd>K</kbd> navigate · <kbd>A</kbd> approve · <kbd>R</kbd> reject
            </span>
          </p>
        </div>
      </header>

      <div className="admin-filter-row">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className="admin-chip"
            aria-pressed={statusParam === s.value}
            onClick={() => {
              setQueryParam("status", s.value === "pending" ? null : s.value);
              setQueryParam("selected", null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="admin-vq-grid">
        <div className="admin-vq-list">
          {listQuery.isPending && <div className="admin-vq-empty">{t("verification.loadingQueue")}</div>}
          {listQuery.isError && (
            <div className="admin-vq-empty" role="alert">
              {t("verification.errorQueue")}
            </div>
          )}
          {!listQuery.isPending && !listQuery.isError && items.length === 0 && (
            <div className="admin-vq-empty">
              {statusParam === "pending" ? t("verification.emptyPending") : t("verification.emptyFiltered")}
            </div>
          )}
          {items.map((p) => {
            const days = daysSince(p.created_at);
            return (
              <button
                key={p.id}
                type="button"
                className="admin-vq-row"
                aria-current={p.id === selectedId}
                onClick={() => setQueryParam("selected", p.id)}
              >
                <div className="admin-vq-row-head">
                  <span className="admin-vq-tenant">{p.payer_name}</span>
                  <span className="admin-vq-amount">{formatMoney(p.amount_cents, p.currency_code)}</span>
                </div>
                <div className="admin-vq-meta">
                  <span>{p.transfer_reference ?? t("verification.noRef")}</span>
                  <span className={`admin-vq-days ${daysClass(days)}`}>
                    {days === 0 ? t("verification.today") : `${days}d pending`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="admin-vq-detail">
          {!selectedId && (
            <div className="admin-vq-pane-empty">{t("verification.selectProof")}</div>
          )}
          {selectedId && detailQuery.isPending && (
            <div className="admin-vq-pane-empty">{t("verification.loadingProof")}</div>
          )}
          {selectedId && detailQuery.isError && (
            <div className="admin-vq-pane-empty" role="alert">
              {t("verification.errorProof")}
            </div>
          )}
          {detailQuery.data && (
            <>
              <div className="admin-vq-detail-head">
                <div>
                  <h2 className="admin-vq-detail-title">{detailQuery.data.payer_name}</h2>
                  <span className="admin-vq-detail-meta">{detailQuery.data.id}</span>
                </div>
                <Link
                  href={`/verification/${detailQuery.data.id}`}
                  className="admin-tb-action"
                  style={{ textDecoration: "none" }}
                >
                  {t("verification.openDetail")}
                </Link>
              </div>

              <ReceiptViewer proofId={detailQuery.data.id} />

              <MatchIndicators proof={detailQuery.data} />

              <dl className="admin-vq-detail-grid">
                <dt>{t("verification.dl.amount")}</dt>
                <dd>{formatMoney(detailQuery.data.amount_cents, detailQuery.data.currency_code)}</dd>
                <dt>{t("verification.dl.transferDate")}</dt>
                <dd>{detailQuery.data.transfer_date}</dd>
                <dt>{t("verification.dl.bankReference")}</dt>
                <dd>{detailQuery.data.transfer_reference ?? "—"}</dd>
                <dt>{t("verification.dl.payerBank")}</dt>
                <dd>{detailQuery.data.payer_bank ?? "—"}</dd>
                <dt>{t("verification.dl.submitted")}</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(detailQuery.data.created_at))}
                </dd>
                <dt>{t("verification.dl.account")}</dt>
                <dd style={{ textTransform: "capitalize" }}>{detailQuery.data.bank_account_kind}</dd>
              </dl>

              <ProofActionBar
                proof={detailQuery.data}
                busy={actionBusy}
                onApprove={handleApprove}
                onReject={() => setRejecting(true)}
                onRequestInfo={() => setRequestingInfo(true)}
              />
            </>
          )}
        </div>
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
