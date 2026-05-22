"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { purchaseOrderGetRequest } from "@/lib/api/purchase-orders";
import { POWizard } from "../../_components/POWizard";

/**
 * Edit a draft PO. We reuse POWizard in `mode="edit"` because:
 *  - the field set is identical (supplier, branch, expected, notes, lines),
 *  - the PATCH endpoint mirrors POST (per `UpdatePOBody`),
 *  - keeping one wizard means a single source of truth for prefill/totals.
 *
 * Only `draft` POs can be edited — the backend rejects PATCH on other
 * statuses with `not_draft`; we also redirect away pre-emptively so the
 * user doesn't fill the wizard for nothing.
 */
export function EditPOClient({
  locale,
  id,
}: {
  locale: "en" | "ar";
  id: string;
}) {
  const t = useTranslations("purchases");

  const q = useQuery({
    queryKey: ["purchase-orders", "detail", id],
    queryFn: () => purchaseOrderGetRequest(id),
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
            {t("detail.backToList")}
          </a>
        </div>
      </div>
    );
  }
  if (q.data.status !== "draft") {
    return (
      <div className="po">
        <div className="po-error">
          <h2>{t("editGuard.title")}</h2>
          <p>{t("editGuard.body")}</p>
          <a className="po-btn" href={`/${locale}/purchases/${id}`}>
            {t("detail.backToList")}
          </a>
        </div>
      </div>
    );
  }

  const po = q.data;

  return (
    <POWizard
      locale={locale}
      mode="edit"
      editingId={id}
      initial={{
        supplier_id: po.supplier.id,
        branch_id: po.branch.id,
        expected_at: po.expected_at ?? undefined,
        notes: po.notes ?? undefined,
        tax_cents: Number(po.tax_cents) || undefined,
        shipping_cents: Number(po.shipping_cents) || undefined,
        lines: po.lines.map((l) => ({
          key:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `k-${Math.random().toString(36).slice(2)}`,
          product_id: l.product_id,
          qty_ordered: l.qty_ordered,
          unit_cost_cents: l.unit_cost_cents,
          from_catalog: false,
        })),
      }}
    />
  );
}
