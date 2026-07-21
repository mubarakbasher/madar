"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

function pageWindow(page: number, totalPages: number, span = 5): number[] {
  const start = Math.max(1, Math.min(page - Math.floor(span / 2), totalPages - span + 1));
  const end = Math.min(totalPages, start + span - 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);
  return pages;
}

export function Pagination({
  shown,
  total,
  page,
  totalPages,
  onPage,
}: {
  shown: number;
  total: number;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("inventory.footer");

  return (
    <div className="inv-footer">
      <span>{t("showing", { shown, total })}</span>
      <div className="inv-pager">
        <button
          type="button"
          className="inv-btn inv-btn-ghost"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          aria-label={t("prevPage")}
        >
          <ChevronLeft size={12} strokeWidth={1.5} className="rtl:rotate-180" />
        </button>
        {pageWindow(page, totalPages).map((p) => (
          <button
            key={p}
            type="button"
            className="inv-chip"
            aria-pressed={p === page}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="inv-btn inv-btn-ghost"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          aria-label={t("nextPage")}
        >
          <ChevronRight size={12} strokeWidth={1.5} className="rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}
