"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Star, Trash2, X, Check } from "lucide-react";
import {
  supplierCatalogCreateRequest,
  supplierCatalogDeleteRequest,
  supplierCatalogListRequest,
  supplierCatalogUpdateRequest,
  type ApiSupplierCatalogEntry,
} from "@/lib/api/suppliers";
import { productsListRequest, type ApiProduct } from "@/lib/api/catalog";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency } from "@/lib/currency";

const COMMON_CURRENCIES = ["EGP", "SDG", "SAR", "AED", "USD", "EUR", "GBP", "TRY", "JOD", "KWD"];

function pickName(i18n: { en: string; ar: string }, locale: string): string {
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function ProductTypeahead({
  value,
  onSelect,
  placeholder,
}: {
  value: ApiProduct | null;
  onSelect: (p: ApiProduct | null) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const q = useQuery({
    queryKey: ["products", "search", query],
    queryFn: () => productsListRequest({ search: query || undefined }),
    staleTime: 30_000,
    enabled: open,
  });
  const items = q.data?.items ?? [];

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {pickName(value.name_i18n, "en")}
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }} className="sup-typeahead-sku">
          {value.sku}
        </span>
        <button
          type="button"
          className="sup-btn sup-btn-sm sup-btn-ghost"
          onClick={() => onSelect(null)}
          aria-label="clear"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="sup-typeahead">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(items.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (items[activeIdx]) {
              onSelect(items[activeIdx]);
              setQuery("");
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && items.length > 0 && (
        <div className="sup-typeahead-list">
          {items.slice(0, 12).map((p, idx) => (
            <div
              key={p.id}
              className={`sup-typeahead-item${idx === activeIdx ? " is-active" : ""}`}
              onMouseDown={() => {
                onSelect(p);
                setQuery("");
                setOpen(false);
              }}
            >
              <div>{pickName(p.name_i18n, "en")}</div>
              <div className="sup-typeahead-sku">{p.sku}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableRow({
  supplierId,
  entry,
  locale,
  canMutate,
  onSaved,
  onRemoved,
}: {
  supplierId: string;
  entry: ApiSupplierCatalogEntry;
  locale: "en" | "ar";
  canMutate: boolean;
  onSaved: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("suppliers.catalog");
  const [editing, setEditing] = useState(false);
  const [supplierSku, setSupplierSku] = useState(entry.supplier_sku ?? "");
  const [unitCost, setUnitCost] = useState((Number(entry.unit_cost_cents) / 100).toString());
  const [currency, setCurrency] = useState(entry.currency_code);
  const [preferred, setPreferred] = useState(entry.is_preferred);
  const [effectiveFrom, setEffectiveFrom] = useState(entry.effective_from ?? "");

  const update = useMutation({
    mutationFn: () =>
      supplierCatalogUpdateRequest(supplierId, entry.product_id, {
        supplier_sku: supplierSku.trim() || null,
        unit_cost_cents: Math.round(Number(unitCost) * 100),
        currency_code: currency,
        is_preferred: preferred,
        effective_from: effectiveFrom || null,
      }),
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  const remove = useMutation({
    mutationFn: () => supplierCatalogDeleteRequest(supplierId, entry.product_id),
    onSuccess: () => onRemoved(),
  });

  const togglePreferred = useMutation({
    mutationFn: (next: boolean) =>
      supplierCatalogUpdateRequest(supplierId, entry.product_id, { is_preferred: next }),
    onSuccess: () => onSaved(),
  });

  if (editing) {
    return (
      <tr>
        <td>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {pickName(entry.product_name_i18n, locale)}
          </div>
          <div className="sup-typeahead-sku">{entry.product_sku}</div>
        </td>
        <td>
          <input
            type="text"
            className="sup-catalog-edit-input"
            value={supplierSku}
            onChange={(e) => setSupplierSku(e.target.value)}
          />
        </td>
        <td>
          <input
            type="number"
            step="0.01"
            min="0"
            className="sup-catalog-edit-input"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
          />
        </td>
        <td>
          <select
            className="sup-catalog-edit-input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {[currency, ...COMMON_CURRENCIES.filter((c) => c !== currency)].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </td>
        <td>
          <button
            type="button"
            className={`sup-catalog-star${preferred ? " is-on" : ""}`}
            onClick={() => setPreferred((p) => !p)}
            aria-pressed={preferred}
            aria-label="preferred"
          >
            <Star size={16} strokeWidth={1.5} fill={preferred ? "currentColor" : "none"} />
          </button>
        </td>
        <td>
          <input
            type="date"
            className="sup-catalog-edit-input"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </td>
        <td>
          <div className="sup-catalog-actions">
            <button
              type="button"
              className="sup-btn sup-btn-sm sup-btn-primary"
              onClick={() => update.mutate()}
              disabled={update.isPending}
              aria-label={t("save")}
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              className="sup-btn sup-btn-sm sup-btn-ghost"
              onClick={() => setEditing(false)}
              aria-label={t("cancel")}
            >
              <X size={12} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const unitCostCents = Number(entry.unit_cost_cents);

  return (
    <tr>
      <td>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {pickName(entry.product_name_i18n, locale)}
        </div>
        <div className="sup-typeahead-sku">{entry.product_sku}</div>
      </td>
      <td>{entry.supplier_sku ?? "—"}</td>
      <td>{formatCurrency(unitCostCents / 100, entry.currency_code, locale)}</td>
      <td>{entry.currency_code}</td>
      <td>
        <button
          type="button"
          className={`sup-catalog-star${entry.is_preferred ? " is-on" : ""}`}
          disabled={!canMutate}
          onClick={() => togglePreferred.mutate(!entry.is_preferred)}
          aria-pressed={entry.is_preferred}
          aria-label="preferred"
        >
          <Star
            size={16}
            strokeWidth={1.5}
            fill={entry.is_preferred ? "currentColor" : "none"}
          />
        </button>
      </td>
      <td>{entry.effective_from ?? "—"}</td>
      <td>
        {canMutate && (
          <div className="sup-catalog-actions">
            <button
              type="button"
              className="sup-btn sup-btn-sm"
              onClick={() => setEditing(true)}
              aria-label={t("edit")}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="sup-btn sup-btn-sm sup-btn-danger"
              onClick={() => {
                if (window.confirm(t("removeConfirm"))) remove.mutate();
              }}
              disabled={remove.isPending}
              aria-label={t("remove")}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function AddRow({
  supplierId,
  defaultCurrency,
  onAdded,
}: {
  supplierId: string;
  defaultCurrency: string;
  onAdded: () => void;
}) {
  const t = useTranslations("suppliers.catalog");
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [supplierSku, setSupplierSku] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [preferred, setPreferred] = useState(false);
  const skuRef = useRef<HTMLInputElement>(null);

  const add = useMutation({
    mutationFn: () => {
      if (!product) throw new Error("no product");
      return supplierCatalogCreateRequest(supplierId, {
        product_id: product.id,
        supplier_sku: supplierSku.trim() || undefined,
        unit_cost_cents: Math.round(Number(unitCost || "0") * 100),
        currency_code: currency,
        is_preferred: preferred,
      });
    },
    onSuccess: () => {
      setProduct(null);
      setSupplierSku("");
      setUnitCost("");
      setPreferred(false);
      onAdded();
    },
  });

  return (
    <div className="sup-catalog-add-row">
      <ProductTypeahead value={product} onSelect={setProduct} placeholder={t("search")} />
      <input
        ref={skuRef}
        type="text"
        placeholder={t("columns.supplierSku")}
        value={supplierSku}
        onChange={(e) => setSupplierSku(e.target.value)}
      />
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder={t("columns.unitCost")}
        value={unitCost}
        onChange={(e) => setUnitCost(e.target.value)}
      />
      <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {[currency, ...COMMON_CURRENCIES.filter((c) => c !== currency)].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`sup-catalog-star${preferred ? " is-on" : ""}`}
        onClick={() => setPreferred((p) => !p)}
        aria-pressed={preferred}
      >
        <Star size={16} strokeWidth={1.5} fill={preferred ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className="sup-btn sup-btn-sm sup-btn-primary"
        onClick={() => add.mutate()}
        disabled={!product || !unitCost || add.isPending}
      >
        {t("add")}
      </button>
    </div>
  );
}

export function CatalogTab({
  supplierId,
  defaultCurrency,
  locale,
}: {
  supplierId: string;
  defaultCurrency: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("suppliers.catalog");
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canMutate = role === "owner" || role === "manager";

  const q = useQuery({
    queryKey: ["suppliers", supplierId, "catalog"],
    queryFn: () => supplierCatalogListRequest(supplierId),
    staleTime: 15_000,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["suppliers", supplierId, "catalog"] });
  };

  return (
    <section className="sup-section">
      <div className="sup-section-head">
        <div>
          <h3 className="sup-section-title">{t("title")}</h3>
          <p className="sup-field-hint">{t("subtitle")}</p>
        </div>
      </div>

      {canMutate && (
        <AddRow
          supplierId={supplierId}
          defaultCurrency={defaultCurrency}
          onAdded={refresh}
        />
      )}

      {q.isPending ? (
        <div className="sup-section-empty">…</div>
      ) : q.isError ? (
        <div className="sup-section-empty">—</div>
      ) : q.data.items.length === 0 ? (
        <div className="sup-section-empty">{t("empty")}</div>
      ) : (
        <table className="sup-table">
          <thead>
            <tr>
              <th>{t("columns.product")}</th>
              <th>{t("columns.supplierSku")}</th>
              <th>{t("columns.unitCost")}</th>
              <th>{t("columns.currency")}</th>
              <th>{t("columns.preferred")}</th>
              <th>{t("columns.effectiveFrom")}</th>
              <th>{t("columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((entry) => (
              <EditableRow
                key={entry.id}
                supplierId={supplierId}
                entry={entry}
                locale={locale}
                canMutate={canMutate}
                onSaved={refresh}
                onRemoved={refresh}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
