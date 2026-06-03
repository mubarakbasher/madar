"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import {
  transferGetRequest,
  transferSendRequest,
  transferReceiveRequest,
  transferCancelRequest,
  transferDeleteRequest,
  type ApiTransferDetail,
} from "@/lib/api/stock-transfers";

function pickName(i18n: { en: string; ar: string } | null, locale: string): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function relTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const fmt = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { numeric: "auto" });
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return fmt.format(-mins, "minute");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return fmt.format(-hrs, "hour");
  const days = Math.floor(hrs / 24);
  return fmt.format(-days, "day");
}

export function TransferDetailClient({ locale, id }: { locale: "en" | "ar"; id: string }) {
  const t = useTranslations("transfers");
  const tErr = useTranslations("transfers.errors");
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? "");
  const userBranchId = useAuthStore((s) => s.user?.branch_id ?? null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [receiveDraft, setReceiveDraft] = useState<
    Record<string, { qty_received: number; discrepancy_note: string }>
  >({});

  const q = useQuery({
    queryKey: ["stock-transfers", "detail", id],
    queryFn: () => transferGetRequest(id),
  });

  // Initialize receive draft when transitioning to in_transit view.
  useEffect(() => {
    if (q.data && q.data.status === "in_transit") {
      setReceiveDraft((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const init: typeof prev = {};
        for (const l of q.data!.lines) {
          init[l.id] = { qty_received: l.qty_sent, discrepancy_note: "" };
        }
        return init;
      });
    }
  }, [q.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["stock-transfers"] });

  const send = useMutation({
    mutationFn: () => transferSendRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => invalidate(),
  });
  const cancel = useMutation({
    mutationFn: () => transferCancelRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => invalidate(),
  });
  const receive = useMutation({
    mutationFn: () => {
      if (!q.data) throw new Error("no data");
      return transferReceiveRequest(id, {
        lines: q.data.lines.map((l) => ({
          line_id: l.id,
          qty_received: receiveDraft[l.id]?.qty_received ?? l.qty_sent,
          discrepancy_note: receiveDraft[l.id]?.discrepancy_note || undefined,
        })),
      });
    },
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => invalidate(),
  });
  const del = useMutation({
    mutationFn: () => transferDeleteRequest(id),
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => {
      window.location.href = `/${locale}/transfers`;
    },
  });

  if (q.isPending) {
    return <div className="xfer"><div className="xfer-skeleton">{t("loading")}</div></div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="xfer">
        <div className="xfer-error">
          <h2>{t("notFound.title")}</h2>
          <p>{t("notFound.body")}</p>
          <a className="xfer-btn" href={`/${locale}/transfers`}>{t("backToList")}</a>
        </div>
      </div>
    );
  }
  const x: ApiTransferDetail = q.data;

  // Branch-correct authorization (mirrors the API). The source branch (or
  // owner) owns the draft lifecycle; the destination branch (or owner) receives.
  const isOwner = role === "owner";
  const canSend = isOwner || (role === "manager" && userBranchId === x.from_branch_id);
  const canReceive = isOwner || (role === "manager" && userBranchId === x.to_branch_id);
  const canManageDraft = canSend; // send / cancel / delete a draft
  const fromName = pickName(x.from_branch_name_i18n, locale);
  const toName = pickName(x.to_branch_name_i18n, locale);
  const showReceiveForm = x.status === "in_transit" && canReceive;

  return (
    <div className="xfer">
      <div className="xfer-detail-head">
        <div>
          <div className="xfer-kicker">{t("detail.kicker")}</div>
          <h1 className="xfer-title">{x.code}</h1>
          <div className="xfer-detail-meta">
            <span>{pickName(x.from_branch_name_i18n, locale)} → {pickName(x.to_branch_name_i18n, locale)}</span>
            <span>·</span>
            <span className={`xfer-pill xfer-pill-${x.status}`}>{t(`status.${x.status}`)}</span>
          </div>
        </div>
        <div className="xfer-detail-actions">
          {x.status === "draft" && canManageDraft && (
            <>
              <button
                type="button"
                className="xfer-btn xfer-btn-ghost"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? t("actions.cancelling") : t("actions.cancel")}
              </button>
              <button
                type="button"
                className="xfer-btn xfer-btn-primary"
                disabled={send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? t("actions.sending") : t("actions.send")}
              </button>
            </>
          )}
          {(x.status === "draft" || x.status === "cancelled") && canManageDraft && (
            <button
              type="button"
              className="xfer-btn xfer-btn-danger"
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
              {del.isPending ? t("actions.deleting") : confirmDelete ? t("actions.deleteConfirm") : t("actions.delete")}
            </button>
          )}
        </div>
      </div>

      {actionError && <div className="xfer-field-error">{actionError}</div>}

      {x.status === "draft" && !canManageDraft && (
        <div className="xfer-status-banner">
          {t("detail.onlySourceCanManage", { branch: fromName })}
        </div>
      )}
      {x.status === "in_transit" && canReceive && (
        <div className="xfer-status-banner">{t("detail.inTransitBanner")}</div>
      )}
      {x.status === "in_transit" && !canReceive && (
        <div className="xfer-status-banner">
          {t("detail.awaitingReceive", { branch: toName })}
        </div>
      )}
      {x.status === "received" && x.has_discrepancy && (
        <div className="xfer-status-banner xfer-status-banner-discrepancy">
          {t("detail.discrepancyBanner")}
        </div>
      )}

      <section className="xfer-card">
        <h2 className="xfer-card-title">
          {showReceiveForm ? t("detail.receiveTitle") : t("detail.linesTitle")}
        </h2>

        {showReceiveForm ? (
          <ReceiveForm
            x={x}
            locale={locale}
            draft={receiveDraft}
            setDraft={setReceiveDraft}
            onSubmit={() => receive.mutate()}
            submitting={receive.isPending}
            t={t}
          />
        ) : (
          <ul className="xfer-lines">
            {x.lines.map((l) => {
              const discrepant = l.qty_received !== null && l.qty_received !== l.qty_sent;
              return (
                <li key={l.id} className="xfer-line-row">
                  <div>
                    <div style={{ fontSize: 13 }}>{pickName(l.product_name_i18n, locale)}</div>
                    <div className="xfer-line-sku">{l.product_sku ?? ""}</div>
                  </div>
                  <span className="xfer-line-sku">{t("detail.sent")}: {l.qty_sent}</span>
                  <span className={`xfer-line-sku ${discrepant ? "xfer-line-discrepancy" : ""}`}>
                    {l.qty_received === null ? "—" : `${t("detail.recv")}: ${l.qty_received}`}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{l.discrepancy_note ?? ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {x.notes && (
        <section className="xfer-card">
          <h2 className="xfer-card-title">{t("detail.notes")}</h2>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{x.notes}</div>
        </section>
      )}

      <section className="xfer-card">
        <h2 className="xfer-card-title">{t("detail.timeline")}</h2>
        <ul className="xfer-lines">
          <li className="xfer-line-row" style={{ gridTemplateColumns: "1fr auto" }}>
            <span>{t("detail.events.created")}</span>
            <span className="xfer-meta">{relTime(x.created_at, locale)}</span>
          </li>
          {x.sent_at && (
            <li className="xfer-line-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>{t("detail.events.sent")}</span>
              <span className="xfer-meta">{relTime(x.sent_at, locale)}</span>
            </li>
          )}
          {x.received_at && (
            <li className="xfer-line-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>{t("detail.events.received")}</span>
              <span className="xfer-meta">{relTime(x.received_at, locale)}</span>
            </li>
          )}
          {x.cancelled_at && (
            <li className="xfer-line-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>{t("detail.events.cancelled")}</span>
              <span className="xfer-meta">{relTime(x.cancelled_at, locale)}</span>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function ReceiveForm({
  x,
  locale,
  draft,
  setDraft,
  onSubmit,
  submitting,
  t,
}: {
  x: ApiTransferDetail;
  locale: string;
  draft: Record<string, { qty_received: number; discrepancy_note: string }>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, { qty_received: number; discrepancy_note: string }>>>;
  onSubmit: () => void;
  submitting: boolean;
  t: (k: string) => string;
}) {
  return (
    <>
      <ul className="xfer-lines">
        {x.lines.map((l) => {
          const entry = draft[l.id] ?? { qty_received: l.qty_sent, discrepancy_note: "" };
          const discrepant = entry.qty_received !== l.qty_sent;
          return (
            <li key={l.id} className="xfer-line-row" style={{ gridTemplateColumns: "1fr 110px 1fr" }}>
              <div>
                <div style={{ fontSize: 13 }}>{pickName(l.product_name_i18n, locale)}</div>
                <div className="xfer-line-sku">
                  {l.product_sku ?? ""} · {t("detail.sent")}: {l.qty_sent}
                </div>
              </div>
              <input
                type="number"
                className="xfer-receive-input"
                value={entry.qty_received}
                min={0}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                  setDraft((prev) => ({ ...prev, [l.id]: { ...entry, qty_received: v } }));
                }}
              />
              <input
                type="text"
                className="xfer-discrepancy-input"
                value={entry.discrepancy_note}
                disabled={!discrepant}
                placeholder={discrepant ? t("detail.discrepancyPlaceholder") : ""}
                onChange={(e) => {
                  setDraft((prev) => ({
                    ...prev,
                    [l.id]: { ...entry, discrepancy_note: e.target.value },
                  }));
                }}
              />
            </li>
          );
        })}
      </ul>
      <div className="xfer-foot">
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("detail.receiveHint")}</span>
        <button type="button" className="xfer-btn xfer-btn-primary" disabled={submitting} onClick={onSubmit}>
          {submitting ? t("actions.receiving") : t("actions.confirmReceive")}
        </button>
      </div>
    </>
  );
}

function mapError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    if (err.code === "transfer_not_sendable") return t("transfer_not_sendable");
    if (err.code === "transfer_not_receivable") return t("transfer_not_receivable");
    if (err.code === "transfer_not_cancellable") return t("transfer_not_cancellable");
    if (err.code === "transfer_not_deletable") return t("transfer_not_deletable");
    if (err.code === "transfer_empty") return t("transfer_empty");
    if (err.code === "incomplete_receive") return t("incomplete_receive");
    if (err.code === "forbidden_role") return t("forbidden_role");
    if (err.code === "forbidden_branch") return t("forbidden_branch");
    if (err.code === "forbidden_during_impersonation") return t("forbidden_during_impersonation");
    return err.message;
  }
  return t("saveFailed");
}
