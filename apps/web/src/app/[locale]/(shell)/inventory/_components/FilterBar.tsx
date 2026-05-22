"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { Category } from "@/lib/mock-data/categories";

export function FilterBar({
  cat,
  setCat,
  stockFilter,
  setStockFilter,
  search,
  setSearch,
  categories,
  locale,
}: {
  cat: string;
  setCat: (c: string) => void;
  stockFilter: "all" | "low";
  setStockFilter: (s: "all" | "low") => void;
  search: string;
  setSearch: (s: string) => void;
  categories: Category[];
  locale: string;
}) {
  const t = useTranslations("inventory.filters");
  // Category labels come from the API row's bilingual `name_i18n` (mapped onto
  // `name` / `nameAr` by adaptCategory). The old static `inventory.categories.<code>`
  // dictionary only covered the demo seed (espresso, pourover, cold, beans,
  // pastry) and threw MISSING_MESSAGE for every other code (e.g. `merch`).
  const pickName = (c: Category) => (locale === "ar" ? c.nameAr || c.name : c.name || c.nameAr);

  return (
    <div className="inv-filters">
      <button
        type="button"
        className="inv-chip"
        aria-pressed={cat === "all"}
        onClick={() => setCat("all")}
      >
        {t("allCategories")}
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          className="inv-chip"
          aria-pressed={cat === c.id}
          onClick={() => setCat(c.id)}
        >
          {pickName(c)}
          <span className="inv-chip-count">{c.count}</span>
        </button>
      ))}
      <span className="inv-filters-divider" />
      <button
        type="button"
        className="inv-chip"
        aria-pressed={stockFilter === "low"}
        onClick={() => setStockFilter(stockFilter === "low" ? "all" : "low")}
      >
        <span className="inv-low-dot" />
        {t("lowStock")}
      </button>
      <span style={{ flex: 1 }} />
      <div className="inv-search">
        <Search size={14} strokeWidth={1.5} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          dir={locale === "ar" ? "rtl" : "ltr"}
        />
      </div>
    </div>
  );
}
