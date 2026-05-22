"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Pencil, Trash2, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  purchaseOrderCancelRequest,
  purchaseOrderDeleteRequest,
  purchaseOrderGetRequest,
  purchaseOrderOrderRequest,
  purchaseOrderPdfUrl,
  type ApiPODetail,
} from "@/lib/api/purchase-orders";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency } from "@/lib/currency";
import { POStatusPill } from "../_components/POStatusPill";
import { POTimeline } from "../_components/POTimeline";
import { SendToSupplierDialog } from "../_components/SendToSupplierDialog";

function pickName(i18n: { en: string; ar: string } | null, locale: string): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function fmtDate(yyyyMmDd: string | null, locale: string): string {
  if (!yyyyMmDd) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
    }).format(new Date(yyyyMmDd + "T00:00:00Z"));
  } catch {
    return yyyyMmDd;
  }
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

export function PODetailClient({
  locale,
  id,
}: {
  locale: "en" | "ar";
  id: string;
}) {
  const t = useTranslations("purchases");
  const tDetail = useTranslations("purchases.detail");
  const tErr = useTranslations("purchases.errors");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const isMutator = role === "owner" || role === "manager";
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  const q = useQuery({
    queryKey: ["purchase-orders", "detail", id],
    queryFn: () => purchaseOrderGetRequest(id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  const order = useMutation({
    mutationFn: (send_email: boolean) =>
      purchaseOrderOrderRequest(id, { send_email }),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => {
      invalidate();
      setSendDialogOpen(false);
    },
  });
  const cancel = useMutation({
    mutationFn: () => purchaseOrderCancelRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => invalidate(),
  });
  const del = useMutation({
    mutationFn: () => purchaseOrderDeleteRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => {
      window.location.href = `/${locale}/purchases`;
    },
  });

  if (q.isPending) {
    return (
      <div className="po">
        <div className="po-skeleton">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="po">
        <div className="po-error">
          <h2>{t("notFound.title")}</h2>
          <p>{t("notFound.body")}</p>
          <a className="po-btn" href={`/${locale}/purchases`}>
            {tDetail("backToList")}
          </a>
        </div>
      </div>
    );
  }

  const po: ApiPODetail = q.data;
  const supplierName = pickName(po.supplier.name_i18n, locale);
  const branchName = pickName(po.branch.name_i18n, locale);

  return (
    <div className="po">
      <div className="po-detail-head">
        <div className="po-detail-head-left">
          <div className="po-kicker">
            {tDetail("kicker", { date: fmtDateTime(po.created_at, locale) })}
          </div>
          <h1 className="po-title">{po.code}</h1>
          <div className="po-detail-meta">
            <span>{supplierName}</span>
            <span>·</span>
            <span>{branchName}</span>
            <span>·</span>
            <span>
              {tDetail("expectedLabel")}: {fmtDate(po.expected_at, locale)}
            </span>
            <POStatusPill status={po.status} />
            {po.has_discrepancy && (
              <span className="po-discrepancy-icon" title={tDetail("hasDiscrepancy")}>
                <AlertTriangle size={14} strokeWidth={1.5} />
                {tDetail("hasDiscrepancy")}
              </span>
            )}
          </div>
        </div>
      </div>

      {actionError && <div className="po-error-banner">{actionError}</div>}

      {/* KPIs */}
      <div className="po-kpis">
        <div className="po-kpi-cell">
          <div className="po-kpi-label">{tDetail("kpis.subtotal")}</div>
          <div className="po-kpi-value">
            {formatCurrency(Number(po.subtotal_cents) / 100, po.currency_code, locale)}
          </div>
        </div>
        <div className="po-kpi-cell">
          <div className="po-kpi-label">{tDetail("kpis.tax")}</div>
          <div className="po-kpi-value">
            {formatCurrency(Number(po.tax_cents) / 100, po.currency_code, locale)}
          </div>
        </div>
        <div className="po-kpi-cell">
          <div className="po-kpi-label">{tDetail("kpis.shipping")}</div>
          <div className="po-kpi-value">
            {formatCurrency(Number(po.shipping_cents) / 100, po.currency_code, locale)}
          </div>
        </div>
        <div className="po-kpi-cell">
          <div className="po-kpi-label">{tDetail("kpis.total")}</div>
          <div className="po-kpi-value">
            {formatCurrency(Number(po.total_cents) / 100, po.currency_code, locale)}
          </div>
        </div>
      </div>

      <div className="po-detail-grid">
        <div>
          {/* Lines table */}
          <section className="po-card">
            <h2 className="po-card-title">{tDetail("lines.title")}</h2>
            <table className="po-lines-table">
              <thead>
                <tr>
                  <th>{t("columns.sku")}</th>
                  <th>{t("columns.product")}</th>
                  <th className="po-num">{t("columns.qtyOrdered")}</th>
                  <th className="po-num">{t("columns.qtyReceived")}</th>
                  <th className="po-num">{t("columns.unitCost")}</th>
                  <th className="po-num">{t("columns.lineTotal")}</th>
                  <th>{t("columns.discrepancy")}</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => {
                  const discrepant =
                    l.qty_received !== null && l.qty_received !== l.qty_ordered;
                  return (
                    <tr key={l.id}>
                      <td>
                        <span className="po-line-sku">{l.product_sku ?? "—"}</span>
                      </td>
                      <td>{pickName(l.product_name_i18n, locale)}</td>
                      <td className="po-num">{l.qty_ordered}</td>
                      <td
                        className="po-num"
                        style={discrepant ? { color: "var(--rose)" } : undefined}
                      >
                        {l.qty_received === null ? "—" : l.qty_received}
                      </td>
                      <td className="po-num">
                        {formatCurrency(
                          Number(l.unit_cost_cents) / 100,
                          po.currency_code,
                          locale,
                        )}
                      </td>
                      <td className="po-num">
                        {formatCurrency(
                          Number(l.line_total_cents) / 100,
                          po.currency_code,
                          locale,
                        )}
                      </td>
                      <td>
                        <span className="po-line-sku">{l.discrepancy_note ?? ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {po.notes && (
            <section className="po-card">
              <h2 className="po-card-title">{tDetail("notesTitle")}</h2>
              <div style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
                {po.notes}
              </div>
            </section>
          )}

          {/* State-aware footer actions */}
          <div className="po-detail-actions">
            {po.status === "draft" && isMutator && (
              <>
                <a className="po-btn" href={`/${locale}/purchases/${po.id}/edit`}>
                  <Pencil size={14} strokeWidth={1.5} /> {tDetail("actions.edit")}
                </a>
                <button
                  type="button"
                  className="po-btn po-btn-primary"
                  onClick={() => setSendDialogOpen(true)}
                  disabled={order.isPending}
                >
                  {order.isPending ? tDetail("actions.ordering") : tDetail("actions.markAsOrdered")}
                </button>
                <button
                  type="button"
                  className="po-btn po-btn-ghost"
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
                  className="po-btn po-btn-danger"
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
            {po.status === "ordered" && isMutator && (
              <>
                <a
                  className="po-btn po-btn-primary"
                  href={`/${locale}/purchases/${po.id}/receive`}
                >
                  {tDetail("actions.receive")}
                </a>
                <a
                  className="po-btn"
                  href={purchaseOrderPdfUrl(po.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={14} strokeWidth={1.5} /> {tDetail("actions.downloadPdf")}
                </a>
              </>
            )}
            {po.status === "received" && (
              <a
                className="po-btn"
                href={purchaseOrderPdfUrl(po.id)}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={14} strokeWidth={1.5} /> {tDetail("actions.downloadPdf")}
              </a>
            )}
            {po.status === "cancelled" && isMutator && (
              <button
                type="button"
                className="po-btn po-btn-danger"
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
            {(confirmDelete || confirmCancel) && (
              <button
                type="button"
                className="po-btn po-btn-ghost"
                onClick={() => {
                  setConfirmDelete(false);
                  setConfirmCancel(false);
                }}
              >
                <X size={14} strokeWidth={1.5} /> {tDetail("actions.dismissConfirm")}
              </button>
            )}
          </div>
        </div>

        <POTimeline po={po} locale={locale} />
      </div>

      <SendToSupplierDialog
        open={sendDialogOpen}
        pending={order.isPending}
        onClose={() => setSendDialogOpen(false)}
        onConfirm={({ send_email }) => order.mutate(send_email)}
        supplierName={supplierName}
        supplierEmail={po.supplier.contact_email}
      />
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
      "product_not_in_catalog",
      "forbidden_branch",
      "forbidden_role",
      "not_draft",
      "not_ordered",
      "incomplete_receive",
      "purchase_order_locked",
      "not_deletable",
    ] as const;
    if ((known as readonly string[]).includes(err.code)) return t(err.code);
    return err.message;
  }
  return t("validation_failed");
}
