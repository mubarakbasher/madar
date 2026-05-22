"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import {
  purchaseOrderGetRequest,
  purchaseOrderReceiveRequest,
  type ApiPODetail,
} from "@/lib/api/purchase-orders";
import { ReceiveLineRow, type ReceiveDraft } from "../../_components/ReceiveLineRow";

function pickName(i18n: { en: string; ar: string } | null, locale: string): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

export function ReceivePOClient({
  locale,
  id,
}: {
  locale: "en" | "ar";
  id: string;
}) {
  const t = useTranslations("purchases.receive");
  const tBase = useTranslations("purchases");
  const tErr = useTranslations("purchases.errors");
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, ReceiveDraft>>({});
  const [submitted, setSubmitted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["purchase-orders", "detail", id],
    queryFn: () => purchaseOrderGetRequest(id),
  });

  // Initialize the draft once the PO loads (defaults qty_received = qty_ordered).
  useEffect(() => {
    if (q.data && q.data.status === "ordered" && Object.keys(draft).length === 0) {
      const init: Record<string, ReceiveDraft> = {};
      for (const l of q.data.lines) {
        init[l.id] = { qty_received: l.qty_ordered, discrepancy_note: "" };
      }
      setDraft(init);
    }
  }, [q.data, draft]);

  const receive = useMutation({
    mutationFn: () => {
      if (!q.data) throw new Error("no data");
      return purchaseOrderReceiveRequest(id, {
        lines: q.data.lines.map((l) => ({
          line_id: l.id,
          qty_received: draft[l.id]?.qty_received ?? l.qty_ordered,
          discrepancy_note: draft[l.id]?.discrepancy_note?.trim() || undefined,
        })),
      });
    },
    onError: (e) => setActionError(mapError(e, tErr)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setSubmitted(true);
      window.setTimeout(() => {
        window.location.href = `/${locale}/purchases/${id}?received=1`;
      }, 600);
    },
  });

  if (q.isPending) {
    return (
      <div className="po">
        <div className="po-skeleton">{tBase("loading")}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="po">
        <div className="po-error">
          <h2>{tBase("notFound.title")}</h2>
          <p>{tBase("notFound.body")}</p>
          <a className="po-btn" href={`/${locale}/purchases`}>
            {tBase("detail.backToList")}
          </a>
        </div>
      </div>
    );
  }

  const po: ApiPODetail = q.data;

  // Status guard — if the PO is no longer `ordered`, show a banner.
  if (po.status !== "ordered") {
    return (
      <div className="po">
        <div className="po-error">
          <h2>{t("statusGuard.title")}</h2>
          <p>{t("statusGuard.body")}</p>
          <a className="po-btn" href={`/${locale}/purchases/${id}`}>
            {t("statusGuard.backToDetail")}
          </a>
        </div>
      </div>
    );
  }

  const supplierName = pickName(po.supplier.name_i18n, locale);
  const branchName = pickName(po.branch.name_i18n, locale);
  const hasInvalid = po.lines.some((l) => {
    const v = draft[l.id]?.qty_received;
    return v === undefined || v < 0 || !Number.isFinite(v);
  });

  return (
    <div className="po">
      <header className="po-head">
        <div className="po-head-text">
          <div className="po-kicker">{po.code}</div>
          <h1 className="po-title">{t("title")}</h1>
          <p className="po-subtitle">
            {supplierName} · {branchName}
          </p>
        </div>
      </header>

      {actionError && <div className="po-error-banner">{actionError}</div>}

      <section className="po-card">
        <h2 className="po-card-title">{t("linesTitle")}</h2>
        {po.lines.map((l) => (
          <ReceiveLineRow
            key={l.id}
            line={l}
            locale={locale}
            value={draft[l.id] ?? { qty_received: l.qty_ordered, discrepancy_note: "" }}
            onChange={(next) => setDraft((prev) => ({ ...prev, [l.id]: next }))}
          />
        ))}

        <div className="po-foot">
          <a className="po-btn po-btn-ghost" href={`/${locale}/purchases/${id}`}>
            {tBase("detail.actions.cancel")}
          </a>
          <button
            type="button"
            className="po-btn po-btn-primary"
            disabled={hasInvalid || receive.isPending}
            onClick={() => receive.mutate()}
          >
            {receive.isPending ? t("receiving") : t("receiveAll")}
          </button>
        </div>
      </section>

      {submitted && <div className="po-toast" role="status">{t("success")}</div>}
    </div>
  );
}

function mapError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    const known = [
      "validation_failed",
      "unknown_product",
      "incomplete_receive",
      "not_ordered",
      "purchase_order_locked",
      "forbidden_role",
      "forbidden_branch",
    ] as const;
    if ((known as readonly string[]).includes(err.code)) return t(err.code);
    return err.message;
  }
  return t("validation_failed");
}
