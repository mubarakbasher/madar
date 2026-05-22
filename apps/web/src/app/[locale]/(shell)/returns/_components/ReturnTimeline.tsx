"use client";

import { useTranslations } from "next-intl";
import type { ApiReturnDetail } from "@/lib/api/supplier-returns";

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
 * Vertical state timeline for a supplier return. Rows are fixed (Created /
 * Sent / Refunded). The Cancelled row is rendered only when the return is
 * cancelled; it appears after the un-reached future steps.
 *
 * A dot is solid when the step is reached and hollow otherwise. Refunded uses
 * the sage token (good outcome), Cancelled uses rose, the rest accent.
 * Tokens only.
 */
export function ReturnTimeline({
  rma,
  locale,
}: {
  rma: ApiReturnDetail;
  locale: "en" | "ar";
}) {
  const t = useTranslations("returns.detail.timeline");

  const isCancelled = rma.status === "cancelled";
  const reached = {
    created: true,
    sent:
      rma.status === "sent" ||
      rma.status === "refunded" ||
      Boolean(rma.sent_at),
    refunded: rma.status === "refunded",
  };

  const rows: Array<{
    key: string;
    label: string;
    when: string | null;
    reached: boolean;
    tone?: "refunded" | "cancelled";
  }> = [
    {
      key: "created",
      label: t("created"),
      when: rma.created_at,
      reached: reached.created,
    },
    {
      key: "sent",
      label: t("sent"),
      when: rma.sent_at,
      reached: reached.sent,
    },
    {
      key: "refunded",
      label: t("refunded"),
      when: rma.refunded_at,
      reached: reached.refunded,
      tone: reached.refunded ? "refunded" : undefined,
    },
  ];
  if (isCancelled) {
    rows.push({
      key: "cancelled",
      label: t("cancelled"),
      when: rma.cancelled_at,
      reached: true,
      tone: "cancelled",
    });
  }

  return (
    <aside className="rma-timeline" aria-label={t("title")}>
      <h2 className="rma-timeline-title">{t("title")}</h2>
      <ul className="rma-timeline-list">
        {rows.map((r) => (
          <li key={r.key} className="rma-timeline-item">
            <span
              className={`rma-timeline-dot ${
                r.tone === "cancelled"
                  ? "rma-timeline-dot-cancelled"
                  : r.tone === "refunded"
                    ? "rma-timeline-dot-refunded"
                    : r.reached
                      ? "rma-timeline-dot-on"
                      : ""
              }`}
              aria-hidden="true"
            />
            <div className="rma-timeline-body">
              <span
                className={`rma-timeline-label ${
                  r.reached ? "" : "rma-timeline-label-muted"
                }`}
              >
                {r.label}
              </span>
              {r.when && (
                <span className="rma-timeline-meta">
                  {fmtDateTime(r.when, locale)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
