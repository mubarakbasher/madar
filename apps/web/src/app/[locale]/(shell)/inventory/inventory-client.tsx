"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "./inventory.css";
import type { Product } from "@/lib/mock-data/products";
import type { Category } from "@/lib/mock-data/categories";
import { categoriesListRequest, productsListRequest } from "@/lib/api/catalog";
import { adaptCategory, adaptProduct } from "@/lib/api/catalog-adapter";
import { branchScopeParam, useBranchScopeStore } from "@/lib/branch-scope/store";
import { useAuthStore } from "@/lib/auth/store";
import { InventoryHeader } from "./_components/InventoryHeader";
import { AiReorderNudge } from "./_components/AiReorderNudge";
import { FilterBar } from "./_components/FilterBar";
import { BulkActionBar } from "./_components/BulkActionBar";
import { BulkEditPriceModal } from "./_components/BulkEditPriceModal";
import { BulkAdjustStockModal } from "./_components/BulkAdjustStockModal";
import { PrintLabelsSheet } from "./_components/PrintLabelsSheet";
import { ProductsTable, type SortKey, type SortState } from "./_components/ProductsTable";
import { Pagination } from "./_components/Pagination";
import { InventoryEmpty } from "./_components/InventoryEmpty";
import { InventorySkeleton } from "./_components/InventorySkeleton";
import { InventoryError } from "./_components/InventoryError";

type BulkModal = null | "editPrice" | "adjustStock" | "printLabels";

type StockFilter = "all" | "low";

/**
 * Data-fetching boundary for the inventory page. The view logic
 * (filters/sort/pagination/bulk-edit UI) lives in `InventoryView` below and
 * stays identical to the pre-1.8 mock-data world — we only change where the
 * `Product[]` + `Category[]` come from.
 */
export function InventoryClient({ locale }: { locale: "en" | "ar" }) {
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const hydrated = useBranchScopeStore((s) => s.hydrated);
  const hydrate = useBranchScopeStore((s) => s.hydrate);
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);
  const branchParam = branchScopeParam(selectedBranchId);

  const productsQ = useQuery({
    queryKey: ["catalog", "products", { branch_id: branchParam ?? "all" }],
    queryFn: () => productsListRequest({ branch_id: branchParam }),
    staleTime: 30_000,
  });
  const categoriesQ = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => categoriesListRequest(),
    staleTime: 60_000,
  });

  if (productsQ.isPending || categoriesQ.isPending) return <InventorySkeleton />;
  if (productsQ.isError || categoriesQ.isError) {
    return (
      <InventoryError
        onRetry={() => {
          void productsQ.refetch();
          void categoriesQ.refetch();
        }}
      />
    );
  }

  const products = productsQ.data.items.map((p) => adaptProduct(p, locale));
  const categories = categoriesQ.data.items.map((c) => adaptCategory(c, locale));

  if (products.length === 0) return <InventoryEmpty />;

  return (
    <InventoryView
      products={products}
      categories={categories}
      locale={locale}
      branchId={branchParam ?? null}
    />
  );
}

function InventoryView({
  products,
  categories,
  locale,
  branchId,
}: {
  products: Product[];
  categories: Category[];
  locale: string;
  branchId: string | null;
}) {
  const [cat, setCat] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState<BulkModal>(null);
  const qc = useQueryClient();
  const tenant = useAuthStore((s) => s.tenant);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canReorder = role === "owner" || role === "manager";

  const rows = useMemo(() => {
    const filtered = products.filter((p) => {
      if (cat !== "all" && p.cat !== cat) return false;
      if (stockFilter === "low" && p.stock >= p.low) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      const asv = String(av);
      const bsv = String(bv);
      return sort.dir === "asc" ? asv.localeCompare(bsv) : bsv.localeCompare(asv);
    });
  }, [products, cat, stockFilter, search, sort]);

  const totalValue = useMemo(
    () => products.reduce((s, p) => s + p.cost * p.stock, 0),
    [products],
  );
  const lowCount = useMemo(
    () => products.filter((p) => p.stock < p.low).length,
    [products],
  );

  const sortBy = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  // Category labels come from the API row's bilingual `name_i18n` (mapped onto
  // `name` / `nameAr` by adaptCategory) — not the static i18n dictionary,
  // which only covered the demo seed.
  const categoryLabel = (catId: string) => {
    const c = categories.find((c) => c.id === catId);
    if (!c) return catId;
    return locale === "ar" ? c.nameAr || c.name : c.name || c.nameAr;
  };

  return (
    <div className="inv">
      <InventoryHeader
        skuCount={products.length}
        onHandValue={totalValue}
        lowCount={lowCount}
        locale={locale}
        branchId={branchId}
        canReorder={canReorder}
      />

      <AiReorderNudge
        branchId={branchId}
        canReorder={canReorder}
        locale={locale === "ar" ? "ar" : "en"}
      />

      <FilterBar
        cat={cat}
        setCat={setCat}
        stockFilter={stockFilter}
        setStockFilter={setStockFilter}
        search={search}
        setSearch={setSearch}
        categories={categories}
        locale={locale}
      />

      {selected.length > 0 && (
        <BulkActionBar
          count={selected.length}
          onClear={() => setSelected([])}
          onEditPrice={() => setOpenModal("editPrice")}
          onAdjustStock={() => setOpenModal("adjustStock")}
          onPrintLabels={() => setOpenModal("printLabels")}
        />
      )}

      <ProductsTable
        rows={rows}
        selected={selected}
        setSelected={setSelected}
        sort={sort}
        onSort={sortBy}
        categoryLabel={categoryLabel}
        locale={locale}
      />

      <Pagination shown={rows.length} total={products.length} />

      {openModal === "editPrice" && (
        <BulkEditPriceModal
          rows={selectedRows(rows, selected).map((p) => ({
            id: p.id,
            name: p.name,
            priceMajor: p.price,
          }))}
          onClose={() => setOpenModal(null)}
          onDone={() => {
            setOpenModal(null);
            setSelected([]);
            qc.invalidateQueries({ queryKey: ["catalog"] });
          }}
        />
      )}

      {openModal === "adjustStock" && (
        <BulkAdjustStockModal
          rows={selectedRows(rows, selected).map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setOpenModal(null)}
          onDone={() => {
            setOpenModal(null);
            setSelected([]);
            qc.invalidateQueries({ queryKey: ["catalog"] });
          }}
        />
      )}

      {openModal === "printLabels" && (
        <PrintLabelsSheet
          rows={selectedRows(rows, selected).map((p) => ({
            sku: p.sku,
            name: p.name,
            priceMajor: p.price,
            currency: tenant?.default_currency_code ?? "EGP",
          }))}
          currency={tenant?.default_currency_code ?? "EGP"}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
}

function selectedRows(rows: Product[], ids: string[]): Product[] {
  const set = new Set(ids);
  return rows.filter((r) => set.has(r.id));
}
