"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { ApiProduct } from "@/lib/api/catalog";
import { formatCurrency } from "@/lib/currency";

export interface DraftRMALine {
  /** Stable key so React doesn't lose focus when reordering. */
  key: string;
  product_id: string | null;
  qty: number;
  /** Decimal-string cents — empty string while user is typing. */
  unit_cost_cents: string;
  /** Free-text short token. Suggestion chips fill this in. */
  reason_code: string;
}

const SUGGESTED_CODES = ["damaged", "wrong_item", "expired", "other"] as const;
type SuggestedCode = (typeof SUGGESTED_CODES)[number];

function pickName(
  i18n: { en: string; ar: string } | null | undefined,
  locale: string,
): string {
  if (!i18n) return "";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

/**
 * Inline product picker + qty + unit cost + reason_code row used in the
 * supplier-return form. Mirrors POLineEditor in shape but adds a free-text
 * `reason_code` field with clickable suggestion chips (damaged / wrong_item
 * / expired / other).
 *
 * No supplier-catalog prefill — unlike POs, returns aren't constrained to
 * the supplier's catalog (you can return whatever was actually sold).
 */
export function ReturnLineEditor({
  line,
  onChange,
  onRemove,
  products,
  currencyCode,
  locale,
}: {
  line: DraftRMALine;
  onChange: (next: DraftRMALine) => void;
  onRemove: () => void;
  products: ApiProduct[];
  currencyCode: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("returns.form");
  const tSuggested = useTranslations("returns.form.suggested");

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
    onChange({ ...line, product_id: p.id });
    setQuery("");
    setOpen(false);
  }

  function clearProduct() {
    onChange({ ...line, product_id: null });
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const qty = line.qty;
  const costNum = Number(line.unit_cost_cents) || 0;
  const lineTotal = qty * costNum;

  // The reason_code chip is "active" only when it matches the current value
  // case-insensitively. Free-text edits still flow through normally.
  const activeChip = SUGGESTED_CODES.find(
    (c) => c === (line.reason_code || "").toLowerCase().trim(),
  );

  // Pretty label for each suggestion code via i18n.
  const chipLabel = (code: SuggestedCode): string => {
    // Keys: damaged | wrongItem | expired | other (camelCased for i18n).
    const k = code === "wrong_item" ? "wrongItem" : code;
    return tSuggested(k as "damaged" | "wrongItem" | "expired" | "other");
  };

  return (
    <div className="rma-line-row">
      <div className="rma-line-product">
        {selected ? (
          <div>
            <div className="rma-line-name">{pickName(selected.name_i18n, locale)}</div>
            <div className="rma-line-sku">{selected.sku}</div>
            <button
              type="button"
              className="rma-change-link"
              onClick={clearProduct}
              aria-label={t("changeProduct")}
            >
              {t("changeProduct")}
            </button>
          </div>
        ) : (
          <div className="rma-typeahead">
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
              <div className="rma-typeahead-list" role="listbox">
                {filtered.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`rma-typeahead-item ${i === activeIdx ? "is-active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickProduct(p)}
                  >
                    <span>{pickName(p.name_i18n, locale)}</span>
                    <span className="rma-typeahead-sku">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <input
        type="number"
        className="rma-line-input"
        min={1}
        value={qty}
        onChange={(e) =>
          onChange({
            ...line,
            qty: Math.max(1, parseInt(e.target.value, 10) || 1),
          })
        }
        aria-label={t("qty")}
      />

      <input
        type="number"
        className="rma-line-input"
        min={0}
        step="0.01"
        value={line.unit_cost_cents}
        onChange={(e) => onChange({ ...line, unit_cost_cents: e.target.value })}
        aria-label={t("unitCost")}
        placeholder="0"
      />

      <div className="rma-line-total">
        {formatCurrency(lineTotal / 100, currencyCode, locale)}
      </div>

      <div className="rma-reason-input">
        <input
          type="text"
          className="rma-line-input"
          value={line.reason_code}
          onChange={(e) => onChange({ ...line, reason_code: e.target.value })}
          aria-label={t("reasonCode")}
          placeholder={t("reasonCode")}
          maxLength={64}
        />
        <div className="rma-chip-row">
          {SUGGESTED_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className={`rma-chip ${activeChip === code ? "rma-chip-active" : ""}`}
              onClick={() => onChange({ ...line, reason_code: code })}
            >
              {chipLabel(code)}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="rma-icon-btn"
        onClick={onRemove}
        aria-label={t("removeLine")}
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
