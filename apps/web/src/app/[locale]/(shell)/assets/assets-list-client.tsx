"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Link } from "../../../../../i18n/routing";
import { assetsListRequest, assetDeleteRequest, type ApiFixedAsset } from "@/lib/api/assets";
import { branchesListRequest } from "@/lib/api/branches";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function AssetsListClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("assets");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const debounced = useDebounced(search, 300);

  const branchesQ = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesListRequest(),
    staleTime: 60_000,
  });

  const listQ = useQuery({
    queryKey: ["assets", "list", { search: debounced.trim(), branchId }],
    queryFn: () =>
      assetsListRequest({
        search: debounced.trim() || undefined,
        branchId: branchId || undefined,
        limit: 100,
      }),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => assetDeleteRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });

  const items = useMemo<ApiFixedAsset[]>(() => listQ.data?.items ?? [], [listQ.data]);
  const branches = branchesQ.data?.items ?? [];

  function onDelete(a: ApiFixedAsset) {
    const label = a.name_i18n[locale] || a.name_i18n.en;
    if (window.confirm(t("deleteConfirm", { name: label }))) {
      deleteMut.mutate(a.id);
    }
  }

  return (
    <div className="as-page">
      <div className="as-header">
        <div>
          <div className="as-kicker">{t("kicker")}</div>
          <h1 className="as-title">{t("listTitle")}</h1>
          <p className="as-subtitle">{t("listSubtitle")}</p>
        </div>
        <div className="as-actions">
          <Link href="/assets/new" className="as-btn as-btn-primary">
            <Plus size={16} strokeWidth={1.5} />
            {t("addAsset")}
          </Link>
        </div>
      </div>

      <div className="as-toolbar">
        <div style={{ position: "relative" }}>
          <Search
            size={16}
            strokeWidth={1.5}
            style={{
              position: "absolute",
              insetInlineStart: 14,
              insetBlockStart: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-3)",
            }}
          />
          <input
            className="as-search"
            style={{ paddingInlineStart: 40 }}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="as-filter"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          aria-label={t("filterBranch")}
        >
          <option value="">{t("allBranches")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name_i18n[locale] || b.name_i18n.en}
            </option>
          ))}
        </select>
      </div>

      {listQ.isPending ? (
        <div className="as-empty">{t("loading")}</div>
      ) : listQ.isError ? (
        <div className="as-empty">
          <div className="as-empty-title">{t("errorTitle")}</div>
          <p>{t("errorBody")}</p>
          <button type="button" className="as-btn" onClick={() => listQ.refetch()}>
            {t("retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="as-empty">
          <div className="as-empty-title">{t("emptyTitle")}</div>
          <p>{t("emptyBody")}</p>
          <Link
            href="/assets/new"
            className="as-btn as-btn-primary"
            style={{ marginBlockStart: "var(--space-4)" }}
          >
            <Plus size={16} strokeWidth={1.5} />
            {t("addAsset")}
          </Link>
        </div>
      ) : (
        <table className="as-table">
          <thead>
            <tr>
              <th>{t("colName")}</th>
              <th>{t("colBranch")}</th>
              <th>{t("colQuantity")}</th>
              <th aria-label={t("colActions")} />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="as-name">{a.name_i18n[locale] || a.name_i18n.en}</div>
                  {a.notes && (
                    <div className="as-muted" style={{ fontSize: 11 }}>
                      {a.notes}
                    </div>
                  )}
                </td>
                <td className="as-muted">
                  {a.branch_name_i18n
                    ? a.branch_name_i18n[locale] || a.branch_name_i18n.en
                    : "—"}
                </td>
                <td className="as-qty">{a.quantity}</td>
                <td>
                  <div className="as-row-actions">
                    <Link
                      href={`/assets/${a.id}/edit`}
                      className="as-iconbtn"
                      aria-label={t("edit")}
                    >
                      <Pencil size={15} strokeWidth={1.5} />
                    </Link>
                    <button
                      type="button"
                      className="as-iconbtn as-iconbtn-danger"
                      aria-label={t("delete")}
                      disabled={deleteMut.isPending}
                      onClick={() => onDelete(a)}
                    >
                      <Trash2 size={15} strokeWidth={1.5} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
