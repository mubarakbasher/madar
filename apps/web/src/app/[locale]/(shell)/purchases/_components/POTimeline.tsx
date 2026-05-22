"use client";

import { useTranslations } from "next-intl";
import type { ApiPODetail } from "@/lib/api/purchase-orders";

function fmtDateTime(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/**
 * Vertical state timeline for a PO. Rows are fixed (Draft created / Ordered /
 * Received). The Cancelled row is rendered only when the PO is cancelled; it
 * replaces the not-yet-reached Ordered/Received future steps visually.
 *
 * A dot is solid when the step is reached and hollow otherwise. Tokens only.
 */
export function POTimeline({
  po,
  locale,
}: {
  po: ApiPODetail;
  locale: "en" | "ar";
}) {
  const t = useTranslations("purchases.detail.timeline");

  const isCancelled = po.status === "cancelled";
  const reached = {
    created: true,
    ordered: po.status === "ordered" || po.status === "received",
    received: po.status === "received",
  };

  const rows: Array<{
    key: string;
    label: string;
    when: string | null;
    reached: boolean;
    cancelled?: boolean;
  }> = [
    { key: "created", label: t("created"), when: po.created_at, reached: reached.created },
    { key: "ordered", label: t("ordered"), when: po.ordered_at, reached: reached.ordered },
    { key: "received", label: t("received"), when: po.received_at, reached: reached.received },
  ];
  if (isCancelled) {
    rows.push({
      key: "cancelled",
      label: t("cancelled"),
      when: po.cancelled_at,
      reached: true,
      cancelled: true,
    });
  }

  return (
    <aside className="po-timeline" aria-label={t("title")}>
      <h2 className="po-timeline-title">{t("title")}</h2>
      <ul className="po-timeline-list">
        {rows.map((r) => (
          <li key={r.key} className="po-timeline-item">
            <span
              className={`po-timeline-dot ${
                r.cancelled
                  ? "po-timeline-dot-cancelled"
                  : r.reached
                    ? "po-timeline-dot-on"
                    : ""
              }`}
              aria-hidden="true"
            />
            <div className="po-timeline-body">
              <span
                className={`po-timeline-label ${r.reached ? "" : "po-timeline-label-muted"}`}
              >
                {r.label}
              </span>
              {r.when && (
                <span className="po-timeline-meta">{fmtDateTime(r.when, locale)}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
