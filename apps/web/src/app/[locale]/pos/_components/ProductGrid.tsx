"use client";

import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import type { MutableRefObject } from "react";
import type { Category } from "@/lib/mock-data/categories";
import type { Product } from "@/lib/mock-data/products";
import { productImagePublicUrl } from "@/lib/api/catalog";
import { currencySymbol, formatNumber } from "@/lib/currency";
import { useAuthStore } from "@/lib/auth/store";
import { useFormat } from "@/lib/i18n/format";

export function ProductGrid({
  search,
  setSearch,
  searchRef,
  cat,
  setCat,
  categories,
  products,
  onAdd,
  locale,
  tenantId,
}: {
  search: string;
  setSearch: (s: string) => void;
  searchRef: MutableRefObject<HTMLInputElement | null>;
  cat: string;
  setCat: (c: string) => void;
  categories: Category[];
  products: Product[];
  onAdd: (id: string) => void;
  locale: string;
  tenantId: string | null;
}) {
  const f = useFormat();
  const t = useTranslations("pos");
  const currencyCode = useAuthStore((s) => s.tenant?.default_currency_code ?? "EGP");
  // Category chips carry tenant data (`name_i18n`), not UI strings — pick the
  // active locale's side, same as the inventory FilterBar. Reading `.name`
  // unconditionally left the POS chips in English on /ar.
  const pickCategoryName = (c: Category) =>
    locale === "ar" ? c.nameAr || c.name : c.name || c.nameAr;

  return (
    <div className="pos-products">
      <div className="pos-search-row">
        <div className="pos-search">
          <Search size={18} strokeWidth={1.5} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            autoFocus
          />
          {search && (
            <button
              type="button"
              className="pos-search-clear"
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label={t("search.clear")}
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      <div className="pos-cats no-scrollbar">
        <button
          type="button"
          className="pos-cat"
          aria-pressed={cat === "all"}
          onClick={() => setCat("all")}
        >
          {t("categories.all")}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className="pos-cat"
            aria-pressed={cat === c.id}
            onClick={() => setCat(c.id)}
          >
            {pickCategoryName(c)}
            <span className="pos-cat-count tnum">{formatNumber(c.count, f.locale)}</span>
          </button>
        ))}
      </div>

      <div className="pos-grid-wrap">
        {products.length === 0 ? (
          <div className="pos-grid-empty">
            <Search size={28} strokeWidth={1.5} />
            <p className="serif">
              {t("search.noResults")} <em>&ldquo;{search}&rdquo;</em>
            </p>
            <button type="button" className="pos-btn pos-btn-ghost" onClick={() => setSearch("")}>
              {t("search.clearLabel")}
            </button>
          </div>
        ) : (
          <div className="pos-grid">
            {products.map((p) => {
              const mark = p.name.split(" ")[0]?.slice(0, 2) ?? "·";
              const imgSrc = tenantId ? productImagePublicUrl(tenantId, p.id, p.image_url ?? null) : null;
              return (
                <button key={p.id} type="button" className="pos-tile" onClick={() => onAdd(p.id)}>
                  <div
                    className="pos-tile-visual"
                    style={{
                      background: imgSrc
                        ? "var(--bg-sunk)"
                        : `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #0E0B08))`,
                    }}
                  >
                    {imgSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imgSrc}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="pos-tile-mark serif">{mark}</div>
                    )}
                  </div>
                  <div className="pos-tile-name">{p.name}</div>
                  <div
                    className="pos-tile-price serif tnum"
                    aria-label={`${p.price} ${currencyCode}`}
                  >
                    <span className="cur">{currencySymbol(currencyCode, f.locale)}</span>
                    {formatNumber(p.price, f.locale)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
