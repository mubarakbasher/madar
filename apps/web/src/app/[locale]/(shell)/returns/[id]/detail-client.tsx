"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Pencil, Send, Trash2, Undo2, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  supplierReturnCancelRequest,
  supplierReturnDeleteRequest,
  supplierReturnGetRequest,
  supplierReturnRefundRequest,
  supplierReturnSendRequest,
  type ApiReturnDetail,
} from "@/lib/api/supplier-returns";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency } from "@/lib/currency";
import { RefundDialog } from "../_components/RefundDialog";
import { ReturnStatusPill } from "../_components/ReturnStatusPill";
import { ReturnTimeline } from "../_components/ReturnTimeline";

function pickName(
  i18n: { en: string; ar: string } | null,
  locale: string,
  fallback: string | null = null,
): string {
  if (i18n) {
    const v = locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
    if (v) return v;
  }
  return fallback ?? "—";
}

function fmtDateTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ReturnDetailClient({
  locale,
  id,
}: {
  locale: "en" | "ar";
  id: string;
}) {
  const t = useTranslations("returns");
  const tDetail = useTranslations("returns.detail");
  const tErr = useTranslations("returns.errors");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const isMutator = role === "owner" || role === "manager";
  const qc = useQueryClient();
  const params = useSearchParams();
  const sentFlag = params.get("sent") === "1";

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["supplier-returns", "detail", id],
    queryFn: () => supplierReturnGetRequest(id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["supplier-returns"] });
  };

  const send = useMutation({
    mutationFn: () => supplierReturnSendRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: (data) => {
      invalidate();
      setConfirmSend(false);
      setToast(t("detail.sentToast", { code: data.code }));
    },
  });
  const refund = useMutation({
    mutationFn: (notes?: string) => supplierReturnRefundRequest(id, { notes }),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => {
      invalidate();
      setRefundOpen(false);
    },
  });
  const cancel = useMutation({
    mutationFn: () => supplierReturnCancelRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => {
      invalidate();
      setConfirmCancel(false);
    },
  });
  const del = useMutation({
    mutationFn: () => supplierReturnDeleteRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => {
      window.location.href = `/${locale}/returns`;
    },
  });

  // Surface the "?sent=1" snackbar from the form route. We do it via effect
  // so React Query's loading frame doesn't strip it.
  useEffect(() => {
    if (sentFlag && q.data && q.data.status === "sent") {
      setToast(t("detail.sentToast", { code: q.data.code }));
    }
  }, [sentFlag, q.data, t]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (q.isPending) {
    return (
      <div className="rma">
        <div className="rma-skeleton">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="rma">
        <div className="rma-error">
          <h2>{t("notFound.title")}</h2>
          <p>{t("notFound.body")}</p>
          <a className="rma-btn" href={`/${locale}/returns`}>
            {tDetail("backToList")}
          </a>
        </div>
      </div>
    );
  }

  const rma: ApiReturnDetail = q.data;
  const supplierName = pickName(rma.supplier.name_i18n, locale, rma.supplier.code);
  const branchName = pickName(rma.branch.name_i18n, locale, rma.branch.code);

  // For status='refunded' we replace the "Currency" KPI cell with the refunded
  // timestamp — it's the more informative data point at that stage.
  const showRefundedKpi = rma.status === "refunded" && rma.refunded_at;

  return (
    <div className="rma">
      <div className="rma-detail-head">
        <div className="rma-detail-head-left">
          <div className="rma-kicker">
            {tDetail("kicker", { date: fmtDateTime(rma.created_at, locale) })}
          </div>
          <h1 className="rma-title">{rma.code}</h1>
          <div className="rma-detail-meta">
            <span>{supplierName}</span>
            <span>·</span>
            <span>{branchName}</span>
            <span>·</span>
            <ReturnStatusPill status={rma.status} />
          </div>
        </div>
      </div>

      {actionError && <div className="rma-error-banner">{actionError}</div>}

      {/* KPIs */}
      <div className="rma-kpis">
        <div className="rma-kpi-cell">
          <div className="rma-kpi-label">{tDetail("totalLabel")}</div>
          <div className="rma-kpi-value">
            {formatCurrency(
              Number(rma.total_cents) / 100,
              rma.currency_code,
              locale,
            )}
          </div>
        </div>
        <div className="rma-kpi-cell">
          <div className="rma-kpi-label">{tDetail("lineCount")}</div>
          <div className="rma-kpi-value">{rma.line_count}</div>
        </div>
        <div className="rma-kpi-cell">
          <div className="rma-kpi-label">
            {showRefundedKpi ? tDetail("refundedAt") : tDetail("currency")}
          </div>
          <div className="rma-kpi-value">
            {showRefundedKpi
              ? fmtDateTime(rma.refunded_at as string, locale)
              : rma.currency_code}
          </div>
        </div>
      </div>

      <div className="rma-detail-grid">
        <div>
          {/* Reason (editorial quote-style) */}
          <section className="rma-card">
            <h2 className="rma-card-title">{tDetail("reasonTitle")}</h2>
            <blockquote className="rma-quote">{rma.reason}</blockquote>
          </section>

          {rma.notes && (
            <section className="rma-card">
              <h2 className="rma-card-title">{tDetail("notesTitle")}</h2>
              <div className="rma-notes">{rma.notes}</div>
            </section>
          )}

          {/* Lines table */}
          <section className="rma-card">
            <h2 className="rma-card-title">{tDetail("linesTitle")}</h2>
            <table className="rma-lines-table">
              <thead>
                <tr>
                  <th>{t("columns.code")}</th>
                  <th>{t("columns.product")}</th>
                  <th className="rma-num">{t("columns.qty")}</th>
                  <th className="rma-num">{t("columns.unitCost")}</th>
                  <th className="rma-num">{t("columns.lineTotal")}</th>
                  <th>{t("columns.reasonCode")}</th>
                </tr>
              </thead>
              <tbody>
                {rma.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="rma-line-sku">
                        {l.product_sku ?? "—"}
                      </span>
                    </td>
                    <td>{pickName(l.product_name_i18n, locale)}</td>
                    <td className="rma-num">{l.qty}</td>
                    <td className="rma-num">
                      {formatCurrency(
                        Number(l.unit_cost_cents) / 100,
                        rma.currency_code,
                        locale,
                      )}
                    </td>
                    <td className="rma-num">
                      {formatCurrency(
                        Number(l.line_total_cents) / 100,
                        rma.currency_code,
                        locale,
                      )}
                    </td>
                    <td>
                      <span className="rma-line-sku">{l.reason_code ?? ""}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* State-aware footer actions */}
          <div className="rma-detail-actions">
            {rma.status === "draft" && isMutator && (
              <>
                <a className="rma-btn" href={`/${locale}/returns/${rma.id}/edit`}>
                  <Pencil size={14} strokeWidth={1.5} />{" "}
                  {tDetail("actions.edit")}
                </a>
                <button
                  type="button"
                  className="rma-btn rma-btn-primary"
                  disabled={send.isPending}
                  onClick={() => {
                    setActionError(null);
                    // No supplier email modal here — send is direct (no email
                    // step for returns). Confirm-once pattern protects against
                    // accidental clicks.
                    if (!confirmSend) {
                      setConfirmSend(true);
                      return;
                    }
                    send.mutate();
                  }}
                >
                  <Send size={14} strokeWidth={1.5} />
                  {send.isPending
                    ? tDetail("actions.sending")
                    : confirmSend
                      ? tDetail("actions.sendConfirm")
                      : tDetail("actions.send")}
                </button>
                <button
                  type="button"
                  className="rma-btn rma-btn-ghost"
                  disabled={cancel.isPending}
                  onClick={() => {
                    setActionError(null);
                    if (!confirmCancel) {
                      setConfirmCancel(true);
                      return;
                    }
                    cancel.mutate();
                  }}
                >
                  {cancel.isPending
                    ? tDetail("actions.cancelling")
                    : confirmCancel
                      ? tDetail("actions.cancelConfirm")
                      : tDetail("actions.cancel")}
                </button>
                <button
                  type="button"
                  className="rma-btn rma-btn-danger"
                  disabled={del.isPending}
                  onClick={() => {
                    setActionError(null);
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    del.mutate();
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                  {del.isPending
                    ? tDetail("actions.deleting")
                    : confirmDelete
                      ? tDetail("actions.deleteConfirm")
                      : tDetail("actions.delete")}
                </button>
              </>
            )}
            {rma.status === "sent" && isMutator && (
              <button
                type="button"
                className="rma-btn rma-btn-primary"
                onClick={() => {
                  setActionError(null);
                  setRefundOpen(true);
                }}
              >
                <Undo2 size={14} strokeWidth={1.5} />{" "}
                {tDetail("actions.refund")}
              </button>
            )}
            {rma.status === "cancelled" && isMutator && (
              <button
                type="button"
                className="rma-btn rma-btn-danger"
                disabled={del.isPending}
                onClick={() => {
                  setActionError(null);
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  del.mutate();
                }}
              >
                <Trash2 size={14} strokeWidth={1.5} />
                {del.isPending
                  ? tDetail("actions.deleting")
                  : confirmDelete
                    ? tDetail("actions.deleteConfirm")
                    : tDetail("actions.delete")}
              </button>
            )}
            {(confirmDelete || confirmCancel || confirmSend) && (
              <button
                type="button"
                className="rma-btn rma-btn-ghost"
                onClick={() => {
                  setConfirmDelete(false);
                  setConfirmCancel(false);
                  setConfirmSend(false);
                }}
              >
                <X size={14} strokeWidth={1.5} />{" "}
                {tDetail("actions.dismissConfirm")}
              </button>
            )}
          </div>
        </div>

        <ReturnTimeline rma={rma} locale={locale} />
      </div>

      <RefundDialog
        open={refundOpen}
        pending={refund.isPending}
        onClose={() => setRefundOpen(false)}
        onConfirm={({ notes }) => refund.mutate(notes)}
        rmaCode={rma.code}
      />

      {toast && <div className="rma-toast">{toast}</div>}
    </div>
  );
}

function mapError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    const known = [
      "validation_failed",
      "duplicate_product",
      "unknown_supplier",
      "unknown_branch",
      "unknown_product",
      "forbidden_branch",
      "forbidden_role",
      "not_draft",
      "not_sent",
      "not_deletable",
    ] as const;
    if ((known as readonly string[]).includes(err.code)) return t(err.code);
    return err.message;
  }
  return t("validation_failed");
}
