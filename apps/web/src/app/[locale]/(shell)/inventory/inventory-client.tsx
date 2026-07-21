"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import "./inventory.css";
import type { Product } from "@/lib/mock-data/products";
import type { Category } from "@/lib/mock-data/categories";
import { categoriesListRequest, productsListRequest } from "@/lib/api/catalog";
import { adaptCategory, adaptProduct } from "@/lib/api/catalog-adapter";
import { branchScopeParam, useBranchScopeStore } from "@/lib/branch-scope/store";
import { useAuthStore } from "@/lib/auth/store";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { currencyMinorUnits } from "@/lib/currency";
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

const PAGE_SIZE = 50;

/**
 * Inventory page. Filtering, sorting, and pagination are server-side
 * (`GET /v1/products` with page/limit/sort) — the client holds only the
 * control state and the current page of adapted rows, so large catalogs
 * never ship to the browser in full.
 */
export function InventoryClient({ locale }: { locale: "en" | "ar" }) {
  const tenantCurrency = useAuthStore((s) => s.tenant?.default_currency_code ?? "EGP");
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const hydrated = useBranchScopeStore((s) => s.hydrated);
  const hydrate = useBranchScopeStore((s) => s.hydrate);
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);
  const branchParam = branchScopeParam(selectedBranchId);

  const [cat, setCat] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const debouncedSearch = useDebouncedValue(search, 300);

  // Any filter/sort/branch change restarts from page 1 and drops the
  // selection (selected ids may no longer be on the visible page).
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [debouncedSearch, cat, stockFilter, branchParam, sort.key, sort.dir]);

  const categoriesQ = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => categoriesListRequest(),
    staleTime: 60_000,
  });

  // FilterBar chips carry category *codes* (adaptCategory maps id → code);
  // the API filters by uuid, so resolve through the raw categories response.
  const categoryIdByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categoriesQ.data?.items ?? []) m.set(c.code, c.id);
    return m;
  }, [categoriesQ.data]);
  const categoryId = cat === "all" ? undefined : categoryIdByCode.get(cat);

  const productsQ = useQuery({
    queryKey: [
      "catalog",
      "products",
      {
        branch_id: branchParam ?? "all",
        page,
        search: debouncedSearch,
        cat,
        stockFilter,
        sort: sort.key,
        dir: sort.dir,
        locale,
      },
    ],
    queryFn: () =>
      productsListRequest({
        branch_id: branchParam,
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        category_id: categoryId,
        only_low_stock: stockFilter === "low",
        sort: sort.key,
        dir: sort.dir,
        name_locale: locale,
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  // If the dataset shrinks under us (deletes on another device), an
  // out-of-range page returns zero rows — snap back to the first page.
  const pageEmpty = (productsQ.data?.items.length ?? 0) === 0;
  useEffect(() => {
    if (pageEmpty && page > 1 && !productsQ.isFetching) setPage(1);
  }, [pageEmpty, page, productsQ.isFetching]);

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

  const data = productsQ.data;
  const products = data.items.map((p) => adaptProduct(p, locale, tenantCurrency));
  const categories = categoriesQ.data.items.map((c) => adaptCategory(c, locale));

  const noFilters = !debouncedSearch && cat === "all" && stockFilter === "all";
  if (noFilters && data.total === 0) return <InventoryEmpty />;

  const onHandValue =
    Number(BigInt(data.summary.on_hand_value_cents)) /
    10 ** currencyMinorUnits(tenantCurrency);

  return (
    <InventoryView
      rows={products}
      categories={categories}
      locale={locale}
      branchId={branchParam ?? null}
      skuCount={data.summary.sku_count}
      onHandValue={onHandValue}
      lowCount={data.summary.low_count}
      total={data.total}
      page={page}
      totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
      onPage={setPage}
      cat={cat}
      setCat={setCat}
      stockFilter={stockFilter}
      setStockFilter={setStockFilter}
      search={search}
      setSearch={setSearch}
      sort={sort}
      setSort={setSort}
      selected={selected}
      setSelected={setSelected}
      isRefreshing={productsQ.isFetching && !productsQ.isPending}
    />
  );
}

function InventoryView({
  rows,
  categories,
  locale,
  branchId,
  skuCount,
  onHandValue,
  lowCount,
  total,
  page,
  totalPages,
  onPage,
  cat,
  setCat,
  stockFilter,
  setStockFilter,
  search,
  setSearch,
  sort,
  setSort,
  selected,
  setSelected,
  isRefreshing,
}: {
  rows: Product[];
  categories: Category[];
  locale: string;
  branchId: string | null;
  skuCount: number;
  onHandValue: number;
  lowCount: number;
  total: number;
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  cat: string;
  setCat: (c: string) => void;
  stockFilter: StockFilter;
  setStockFilter: (s: StockFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  sort: SortState;
  setSort: (updater: (current: SortState) => SortState) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  isRefreshing: boolean;
}) {
  const [openModal, setOpenModal] = useState<BulkModal>(null);
  const qc = useQueryClient();
  const tenant = useAuthStore((s) => s.tenant);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canReorder = role === "owner" || role === "manager";

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
    <div className="inv" data-refreshing={isRefreshing || undefined}>
      <InventoryHeader
        skuCount={skuCount}
        onHandValue={onHandValue}
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

      <Pagination
        shown={rows.length}
        total={total}
        page={page}
        totalPages={totalPages}
        onPage={onPage}
      />

      {openModal === "editPrice" && (
        <BulkEditPriceModal
          rows={selectedRows(rows, selected).map((p) => ({
            id: p.id,
            name: p.name,
            priceMajor: p.price,
          }))}
          currencyCode={tenant?.default_currency_code ?? "EGP"}
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
