"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ApiPOLine } from "@/lib/api/purchase-orders";

function pickName(i18n: { en: string; ar: string } | null, locale: string): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

export interface ReceiveDraft {
  qty_received: number;
  discrepancy_note: string;
}

/**
 * Receive screen row. Defaults `qty_received` to `qty_ordered`, auto-flags
 * any discrepancy and lazily renders the note input once the user signals
 * a deliberate note (or there's a discrepancy chip).
 */
export function ReceiveLineRow({
  line,
  value,
  onChange,
  locale,
}: {
  line: ApiPOLine;
  value: ReceiveDraft;
  onChange: (next: ReceiveDraft) => void;
  locale: "en" | "ar";
}) {
  const t = useTranslations("purchases.receive");

  const diff = value.qty_received - line.qty_ordered;
  const hasDiscrepancy = diff !== 0;
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = noteOpen || hasDiscrepancy || value.discrepancy_note !== "";

  return (
    <div className="po-receive-row">
      <div>
        <div className="po-line-name">{pickName(line.product_name_i18n, locale)}</div>
        <div className="po-line-sku">{line.product_sku ?? ""}</div>
      </div>
      <div>
        <div className="po-receive-info-label">{t("expected")}</div>
        <div className="po-receive-expected">{line.qty_ordered}</div>
      </div>
      <div>
        <div className="po-receive-info-label">{t("actual")}</div>
        <input
          type="number"
          className="po-line-input"
          min={0}
          value={value.qty_received}
          onChange={(e) => {
            const next = Math.max(0, parseInt(e.target.value, 10) || 0);
            onChange({ ...value, qty_received: next });
          }}
          aria-label={t("actual")}
        />
        {hasDiscrepancy && (
          <span
            className={diff < 0 ? "po-receive-chip-short" : "po-receive-chip-over"}
          >
            {diff < 0 ? t("shortBy", { n: Math.abs(diff) }) : t("overBy", { n: diff })}
          </span>
        )}
      </div>
      <div>
        {showNote ? (
          <textarea
            className="po-receive-note-input"
            value={value.discrepancy_note}
            placeholder={t("notePlaceholder")}
            onChange={(e) => onChange({ ...value, discrepancy_note: e.target.value })}
          />
        ) : (
          <button
            type="button"
            className="po-receive-note-toggle"
            onClick={() => setNoteOpen(true)}
          >
            + {t("addNote")}
          </button>
        )}
      </div>
    </div>
  );
}
