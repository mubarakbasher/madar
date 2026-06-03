"use client";

import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Link } from "../../../../../../i18n/routing";
import type { Product } from "@/lib/mock-data/products";
import { productImagePublicUrl } from "@/lib/api/catalog";
import { useAuthStore } from "@/lib/auth/store";
import { RowActionsMenu } from "./RowActionsMenu";

export type SortKey = "sku" | "name" | "price" | "cost" | "stock" | "vel";
export type SortState = { key: SortKey; dir: "asc" | "desc" };

export function ProductsTable({
  rows,
  selected,
  setSelected,
  sort,
  onSort,
  categoryLabel,
  locale,
}: {
  rows: Product[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  categoryLabel: (catId: string) => string;
  locale: string;
}) {
  const t = useTranslations("inventory");
  const cur = locale === "ar" ? "ج.م" : "£";
  const tenantId = useAuthStore((s) => s.tenant?.id ?? null);
  const allSelected = selected.length === rows.length && rows.length > 0;

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sort.key !== k) return null;
    return sort.dir === "asc" ? (
      <ArrowUp size={10} strokeWidth={1.75} />
    ) : (
      <ArrowDown size={10} strokeWidth={1.75} />
    );
  };

  const toggleAll = () =>
    setSelected(allSelected ? [] : rows.map((r) => r.id));

  const toggleOne = (id: string) =>
    setSelected(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );

  if (rows.length === 0) {
    return (
      <div className="inv-table-wrap">
        <div className="inv-empty">
          <p>No products match your filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="inv-table-wrap">
      <table className="inv-table">
        <thead>
          <tr>
            <th className="inv-th inv-th-center" style={{ width: 44 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </th>
            <th className="inv-th">
              <button type="button" onClick={() => onSort("sku")}>
                {t("cols.sku")}
                <SortIcon k="sku" />
              </button>
            </th>
            <th className="inv-th" style={{ width: "32%" }}>
              <button type="button" onClick={() => onSort("name")}>
                {t("cols.product")}
                <SortIcon k="name" />
              </button>
            </th>
            <th className="inv-th inv-th-end">
              <button type="button" onClick={() => onSort("price")}>
                {t("cols.price")}
                <SortIcon k="price" />
              </button>
            </th>
            <th className="inv-th inv-th-end">
              <button type="button" onClick={() => onSort("cost")}>
                {t("cols.cost")}
                <SortIcon k="cost" />
              </button>
            </th>
            <th className="inv-th inv-th-end" style={{ width: 80 }}>
              {t("cols.margin")}
            </th>
            <th className="inv-th" style={{ width: 200 }}>
              <button type="button" onClick={() => onSort("stock")}>
                {t("cols.stock")}
                <SortIcon k="stock" />
              </button>
            </th>
            <th className="inv-th inv-th-end" style={{ width: 80 }}>
              <button type="button" onClick={() => onSort("vel")}>
                {t("cols.velocity")}
                <SortIcon k="vel" />
              </button>
            </th>
            <th className="inv-th inv-th-end" style={{ width: 56 }} aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const isLow = p.stock < p.low;
            const margin = Math.round(((p.price - p.cost) / p.price) * 100);
            // Floor the denominator at 1 so a zero-stock product with no reorder
            // point (low = -Infinity) yields 0%, not 0/0 = NaN.
            const stockPct = Math.min(
              100,
              (p.stock / Math.max(p.low * 2.5, p.stock, 1)) * 100,
            );
            const isSel = selected.includes(p.id);
            return (
              <tr
                key={p.id}
                className="inv-row"
                data-low={isLow ? "true" : undefined}
                data-sel={isSel ? "true" : undefined}
              >
                <td className="inv-td inv-td-center">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggleOne(p.id)}
                    aria-label={`Select ${p.name}`}
                  />
                </td>
                <td className="inv-td inv-cell-sku">{p.sku}</td>
                <td className="inv-td">
                  <div className="inv-cell-product">
                    {tenantId && p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={productImagePublicUrl(tenantId, p.id, p.image_url) ?? ""}
                        alt=""
                        className="inv-swatch"
                        style={{ objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        className="inv-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #1A1714))`,
                        }}
                      />
                    )}
                    <div>
                      <Link
                        href={`/inventory/products/${p.id}`}
                        className="inv-cell-product-name"
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {p.name}
                      </Link>
                      <div className="inv-cell-product-cat">{categoryLabel(p.cat)}</div>
                    </div>
                  </div>
                </td>
                <td className="inv-td inv-td-end">
                  {cur}
                  {p.price}
                </td>
                <td className="inv-td inv-td-end inv-cell-cost">
                  {cur}
                  {p.cost}
                </td>
                <td className="inv-td inv-td-end inv-cell-margin">{margin}%</td>
                <td className="inv-td">
                  <div className="inv-stock">
                    <span className="inv-stock-qty" data-low={isLow ? "true" : undefined}>
                      {p.stock}
                    </span>
                    <div className="inv-stock-bar">
                      <div
                        className="inv-stock-bar-fill"
                        data-low={isLow ? "true" : undefined}
                        style={{ width: `${stockPct}%` }}
                      />
                    </div>
                    {isLow && <span className="inv-low-badge">{t("row.lowBadge")}</span>}
                  </div>
                </td>
                <td className="inv-td inv-td-end inv-cell-vel">{p.vel}</td>
                <td className="inv-td inv-td-end">
                  <RowActionsMenu productId={p.id} productName={p.name} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
