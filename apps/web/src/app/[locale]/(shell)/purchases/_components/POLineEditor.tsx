"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { ApiProduct } from "@/lib/api/catalog";
import type { ApiSupplierCatalogEntry } from "@/lib/api/suppliers";
import { formatCurrency } from "@/lib/currency";

export interface DraftPOLine {
  /** Stable key so React doesn't lose focus when reordering. */
  key: string;
  product_id: string | null;
  qty_ordered: number;
  /** Decimal-string cents — empty string while user is typing. */
  unit_cost_cents: string;
  /** Tracks whether the row's cost was prefilled from supplier catalog. */
  from_catalog: boolean;
}

function pickName(i18n: { en: string; ar: string } | null | undefined, locale: string): string {
  if (!i18n) return "";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

/**
 * Inline product picker + qty + unit cost row used in the PO wizard.
 *
 * - When a product is picked we look it up in the supplier catalog map
 *   passed by the parent (already fetched once per supplier). If the
 *   product is in the catalog we prefill cost and show a "from catalog"
 *   chip; otherwise we show a soft "not in catalog" warning so the user
 *   knows to set the cost manually.
 * - The typeahead is a small string match against the parent's
 *   `products` list. We don't refetch on each keystroke; the parent
 *   loads a broader product list once.
 */
export function POLineEditor({
  line,
  onChange,
  onRemove,
  products,
  catalogByProductId,
  currencyCode,
  locale,
}: {
  line: DraftPOLine;
  onChange: (next: DraftPOLine) => void;
  onRemove: () => void;
  products: ApiProduct[];
  catalogByProductId: Map<string, ApiSupplierCatalogEntry>;
  currencyCode: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("purchases.wizard.step2");

  const productById = useMemo(() => {
    const m = new Map<string, ApiProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const selected = line.product_id ? productById.get(line.product_id) ?? null : null;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter products by query, exclude products already keyed-on this line's
  // product so the user can swap without seeing the same row twice. (Other
  // rows are visible — duplicate-product check is done server-side.)
  const filtered = useMemo(() => {
    const qLower = query.toLowerCase();
    if (!query) return products.slice(0, 30);
    return products
      .filter((p) => {
        if (selected && p.id === selected.id) return false;
        return (
          p.sku.toLowerCase().includes(qLower) ||
          (p.name_i18n.en && p.name_i18n.en.toLowerCase().includes(qLower)) ||
          (p.name_i18n.ar && p.name_i18n.ar.includes(query))
        );
      })
      .slice(0, 50);
  }, [products, query, selected]);

  useEffect(() => setActiveIdx(0), [query]);

  function pickProduct(p: ApiProduct) {
    const catalog = catalogByProductId.get(p.id);
    onChange({
      ...line,
      product_id: p.id,
      // If the cost slot is empty (or matched the last prefill) and the
      // product is in the catalog, prefill from catalog. Otherwise leave it.
      unit_cost_cents: catalog ? String(catalog.unit_cost_cents) : line.unit_cost_cents,
      from_catalog: Boolean(catalog),
    });
    setQuery("");
    setOpen(false);
  }

  function clearProduct() {
    onChange({ ...line, product_id: null, from_catalog: false });
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const qty = line.qty_ordered;
  const costNum = Number(line.unit_cost_cents) || 0;
  const lineTotal = qty * costNum;

  const supplierSku =
    selected ? catalogByProductId.get(selected.id)?.supplier_sku ?? null : null;

  return (
    <div className="po-line-row">
      <div className="po-line-product">
        {selected ? (
          <div>
            <div className="po-line-name">{pickName(selected.name_i18n, locale)}</div>
            <div className="po-line-sku">
              {selected.sku}
              {supplierSku ? ` · ${t("supplierSkuPrefix")} ${supplierSku}` : ""}
            </div>
            {line.from_catalog ? (
              <span className="po-line-chip po-line-chip-info">{t("fromCatalog")}</span>
            ) : (
              <span className="po-line-chip po-line-chip-warn">{t("notInCatalog")}</span>
            )}
            <button
              type="button"
              className="po-more-toggle"
              onClick={clearProduct}
              aria-label={t("changeProduct")}
            >
              {t("changeProduct")}
            </button>
          </div>
        ) : (
          <div className="po-typeahead">
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder={t("productPicker")}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (!open) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const p = filtered[activeIdx];
                  if (p) pickProduct(p);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
            {open && filtered.length > 0 && (
              <div className="po-typeahead-list" role="listbox">
                {filtered.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`po-typeahead-item ${i === activeIdx ? "is-active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickProduct(p)}
                  >
                    <span>{pickName(p.name_i18n, locale)}</span>
                    <span className="po-typeahead-sku">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <input
        type="number"
        className="po-line-input"
        min={1}
        value={qty}
        onChange={(e) =>
          onChange({
            ...line,
            qty_ordered: Math.max(1, parseInt(e.target.value, 10) || 1),
          })
        }
        aria-label={t("qty")}
      />

      <input
        type="number"
        className="po-line-input"
        min={0}
        step="0.01"
        value={line.unit_cost_cents}
        onChange={(e) =>
          onChange({
            ...line,
            unit_cost_cents: e.target.value,
            // Once the user edits the cost manually, we stop labelling it as
            // "from catalog".
            from_catalog: false,
          })
        }
        aria-label={t("unitCost")}
        placeholder="0"
      />

      <div className="po-line-total">
        {formatCurrency(lineTotal / 100, currencyCode, locale)}
      </div>

      <button
        type="button"
        className="po-icon-btn"
        onClick={onRemove}
        aria-label={t("removeLine")}
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
