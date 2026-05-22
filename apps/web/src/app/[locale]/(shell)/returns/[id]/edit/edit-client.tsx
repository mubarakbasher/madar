"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { supplierReturnGetRequest } from "@/lib/api/supplier-returns";
import { ReturnForm } from "../../_components/ReturnForm";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}`;
}

/**
 * Edit a draft RMA. We reuse `ReturnForm` in `mode="edit"` because:
 *  - the field set is identical (supplier, branch, reason, notes, lines),
 *  - the PATCH endpoint mirrors POST (per `UpdateReturnBody`),
 *  - keeping one form means a single source of truth for validation/totals.
 *
 * Only `draft` RMAs are editable — the backend rejects PATCH on other
 * statuses with `not_draft`. We bail out pre-emptively with a friendlier
 * read-only banner so the user doesn't fill the form for nothing.
 */
export function EditReturnClient({
  locale,
  id,
}: {
  locale: "en" | "ar";
  id: string;
}) {
  const t = useTranslations("returns");

  const q = useQuery({
    queryKey: ["supplier-returns", "detail", id],
    queryFn: () => supplierReturnGetRequest(id),
  });

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
            {t("detail.backToList")}
          </a>
        </div>
      </div>
    );
  }
  if (q.data.status !== "draft") {
    return (
      <div className="rma">
        <div className="rma-readonly-banner">{t("editGuard.body")}</div>
        <div className="rma-error">
          <h2>{t("editGuard.title")}</h2>
          <a className="rma-btn" href={`/${locale}/returns/${id}`}>
            {t("detail.backToList")}
          </a>
        </div>
      </div>
    );
  }

  const rma = q.data;

  return (
    <ReturnForm
      locale={locale}
      mode="edit"
      editingId={id}
      initial={{
        supplier_id: rma.supplier.id,
        branch_id: rma.branch.id,
        reason: rma.reason,
        notes: rma.notes ?? undefined,
        lines: rma.lines.map((l) => ({
          key: newKey(),
          product_id: l.product_id,
          qty: l.qty,
          unit_cost_cents: l.unit_cost_cents,
          reason_code: l.reason_code ?? "",
        })),
      }}
    />
  );
}
