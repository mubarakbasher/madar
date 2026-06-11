"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, X } from "lucide-react";
import type { ApiHeldSaleSummary } from "@/lib/api/held-sales";
import { minorToMajor } from "@/lib/currency";

export type HeldTicket = ApiHeldSaleSummary;

export function HeldSalesTray({
  held,
  currency,
  onClose,
  onResume,
  onDelete,
}: {
  held: HeldTicket[];
  currency: string;
  onClose: () => void;
  onResume: (t: HeldTicket) => void;
  onDelete: (t: HeldTicket) => void;
}) {
  const t = useTranslations("pos.held");
  const tCommon = useTranslations("common");

  return (
    <div className="pos-modal-bg" onClick={onClose}>
      <div className="pos-modal" style={{ width: 540 }} onClick={(e) => e.stopPropagation()}>
        <header className="pos-modal-head">
          <div>
            <span className="kicker">{t("kicker")}</span>
            <h3 className="serif">{t("title", { count: held.length })}</h3>
          </div>
          <button type="button" className="pos-icon-btn" onClick={onClose} aria-label={tCommon("close")}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </header>
        <div style={{ padding: "0 8px 8px" }}>
          {held.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              {t("empty")}
            </div>
          ) : (
            held.map((h) => {
              // Intentionally rounded to whole major units — compact tray display.
              const totalDisplay = Math.round(minorToMajor(h.total_cents, currency));
              const who = h.customer_name ?? h.cashier_name ?? t("walkInCustomer");
              return (
                <div key={h.id} className="pos-held-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{h.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                      {t("items", { count: h.line_count })} · {formatAgo(h.held_at, t)} · {who}
                    </div>
                  </div>
                  <div
                    className="serif tnum"
                    style={{ fontSize: 22, fontWeight: 500, marginInlineEnd: 12 }}
                  >
                    {totalDisplay} <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{currency}</span>
                  </div>
                  <button
                    type="button"
                    className="pos-btn pos-btn-primary"
                    onClick={() => onResume(h)}
                  >
                    <ArrowRight size={12} strokeWidth={1.5} className="rtl:rotate-180" />
                    {t("resume")}
                  </button>
                  <button
                    type="button"
                    className="pos-icon-btn"
                    onClick={() => onDelete(h)}
                    title={t("discard")}
                    aria-label={t("discard")}
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function formatAgo(iso: string, t: (key: string, vals?: Record<string, number>) => string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.floor((now - then) / 60_000));
  if (diffMin < 1) return t("justNow");
  if (diffMin < 60) return t("minutesAgo", { minutes: diffMin });
  const diffH = Math.floor(diffMin / 60);
  return t("hoursAgo", { hours: diffH });
}
