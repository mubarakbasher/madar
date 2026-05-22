"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ shown, total }: { shown: number; total: number }) {
  const t = useTranslations("inventory.footer");

  return (
    <div className="inv-footer">
      <span>{t("showing", { shown, total })}</span>
      <div className="inv-pager">
        <button type="button" className="inv-btn inv-btn-ghost" aria-label={t("prevPage")}>
          <ChevronLeft size={12} strokeWidth={1.75} className="rtl:rotate-180" />
        </button>
        <button type="button" className="inv-chip" aria-pressed="true">
          1
        </button>
        <button type="button" className="inv-chip" aria-pressed="false">
          2
        </button>
        <button type="button" className="inv-chip" aria-pressed="false">
          3
        </button>
        <button type="button" className="inv-btn inv-btn-ghost" aria-label={t("nextPage")}>
          <ChevronRight size={12} strokeWidth={1.75} className="rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}
