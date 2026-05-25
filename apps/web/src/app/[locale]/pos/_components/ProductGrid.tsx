"use client";

import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import type { MutableRefObject } from "react";
import type { Category } from "@/lib/mock-data/categories";
import type { Product } from "@/lib/mock-data/products";
import { productImagePublicUrl } from "@/lib/api/catalog";

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
  const t = useTranslations("pos");

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
            {c.name}
            <span className="pos-cat-count tnum">{c.count}</span>
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
                      />
                    ) : (
                      <div className="pos-tile-mark serif">{mark}</div>
                    )}
                  </div>
                  <div className="pos-tile-name">{p.name}</div>
                  <div className="pos-tile-price serif tnum" aria-label={`${p.price} EGP`}>
                    <span className="cur">{locale === "ar" ? "ج.م" : "£"}</span>
                    {p.price}
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
