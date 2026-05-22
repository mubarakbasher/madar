"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  purchaseOrdersListRequest,
  type ApiPOSummary,
  type PurchaseOrderStatus,
} from "@/lib/api/purchase-orders";
import { formatCurrency } from "@/lib/currency";

function pickBranchName(
  i18n: { en: string; ar: string } | null,
  code: string | null,
  locale: string,
): string {
  if (!i18n) return code ?? "—";
  return locale === "ar" ? i18n.ar || i18n.en || code || "—" : i18n.en || i18n.ar || code || "—";
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function StatusPill({
  status,
  label,
}: {
  status: PurchaseOrderStatus;
  label: string;
}) {
  return <span className={`sup-po-pill sup-po-pill-${status}`}>{label}</span>;
}

export function OrderHistoryTable({
  supplierId,
  locale,
}: {
  supplierId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("suppliers.orderHistory");
  const tStatus = useTranslations("suppliers.orderHistory.statuses");

  const q = useQuery({
    queryKey: ["purchase-orders", "by-supplier", supplierId],
    queryFn: () => purchaseOrdersListRequest({ supplier_id: supplierId, limit: 20 }),
    staleTime: 30_000,
  });

  return (
    <section className="sup-section">
      <div className="sup-section-head">
        <h3 className="sup-section-title">{t("title")}</h3>
        <a
          className="sup-btn sup-btn-sm"
          href={`/${locale}/purchases/new?supplier_id=${supplierId}`}
        >
          {t("newPo")}
        </a>
      </div>

      {q.isPending ? (
        <div className="sup-section-empty">…</div>
      ) : q.isError ? (
        <div className="sup-section-empty">—</div>
      ) : q.data.items.length === 0 ? (
        <div className="sup-section-empty">{t("empty")}</div>
      ) : (
        <table className="sup-table">
          <thead>
            <tr>
              <th>{t("columns.code")}</th>
              <th>{t("columns.created")}</th>
              <th>{t("columns.status")}</th>
              <th>{t("columns.branch")}</th>
              <th style={{ textAlign: "end" }}>{t("columns.total")}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((po: ApiPOSummary) => {
              const branchName = pickBranchName(po.branch.name_i18n, po.branch.code, locale);
              const total = Number(po.total_cents);
              return (
                <tr key={po.id}>
                  <td>
                    <a className="sup-table-link" href={`/${locale}/purchases/${po.id}`}>
                      {po.code}
                    </a>
                  </td>
                  <td>{formatDate(po.created_at, locale)}</td>
                  <td>
                    <StatusPill status={po.status} label={tStatus(po.status)} />
                  </td>
                  <td>{branchName}</td>
                  <td style={{ textAlign: "end" }}>
                    {formatCurrency(total / 100, po.currency_code, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
