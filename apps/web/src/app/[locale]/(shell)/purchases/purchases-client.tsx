"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertTriangle, Plus } from "lucide-react";
import {
  purchaseOrdersListRequest,
  type ApiPOSummary,
  type PurchaseOrderStatus,
} from "@/lib/api/purchase-orders";
import { suppliersListRequest } from "@/lib/api/suppliers";
import { branchesListRequest } from "@/lib/api/branches";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency, minorToMajor } from "@/lib/currency";
import { POStatusPill } from "./_components/POStatusPill";
import "./purchases.css";

type Tab = PurchaseOrderStatus | "all";

const TABS: { id: Tab; key: "tabs.draft" | "tabs.ordered" | "tabs.received" | "tabs.cancelled" | "tabs.all" }[] = [
  { id: "draft", key: "tabs.draft" },
  { id: "ordered", key: "tabs.ordered" },
  { id: "received", key: "tabs.received" },
  { id: "cancelled", key: "tabs.cancelled" },
  { id: "all", key: "tabs.all" },
];

function pickName(i18n: { en: string; ar: string } | null, locale: string): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function fmtDate(yyyyMmDd: string | null, locale: string): string {
  if (!yyyyMmDd) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
    }).format(new Date(yyyyMmDd + "T00:00:00Z"));
  } catch {
    return yyyyMmDd;
  }
}

function fmtCreated(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PurchasesClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("purchases");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const userBranchId = useAuthStore((s) => s.user?.branch_id ?? null);
  const tenantCurrency = useAuthStore.getState().tenant?.default_currency_code ?? "USD";
  const canCreate = role === "owner" || role === "manager";
  const isManager = role === "manager";

  const [tab, setTab] = useState<Tab>("draft");
  const [supplierId, setSupplierId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");

  // Managers always see their branch — UI also passes it for clarity.
  const effectiveBranchId = isManager ? userBranchId || undefined : branchId || undefined;

  const q = useQuery({
    queryKey: [
      "purchase-orders",
      "list",
      { tab, supplierId, branchId: effectiveBranchId },
    ],
    queryFn: () =>
      purchaseOrdersListRequest({
        status: tab === "all" ? undefined : tab,
        supplier_id: supplierId || undefined,
        branch_id: effectiveBranchId,
        limit: 100,
      }),
    staleTime: 15_000,
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers", "list", "for-po-filter"],
    queryFn: () => suppliersListRequest({ active_only: true, limit: 200 }),
    staleTime: 60_000,
  });
  const suppliers = suppliersQ.data?.items ?? [];

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "for-po-filter"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
    enabled: !isManager,
  });
  const branches = branchesQ.data?.items ?? [];
  const myBranch = isManager ? branches.find((b) => b.id === userBranchId) ?? null : null;

  const items: ApiPOSummary[] = q.data?.items ?? [];

  // Hero KPIs — computed from the current filtered slice. The list endpoint
  // doesn't precompute globally, so this reflects what's on screen. Marked
  // with a comment so a future server-side aggregate can replace it.
  // TODO(api): swap to a dedicated /purchase-orders/summary aggregate.
  const hero = useMemo(() => {
    let openPos = 0;
    let openOwed = 0;
    let thisMonthSpend = 0;
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    for (const row of items) {
      if (row.status === "draft" || row.status === "ordered") {
        openPos += 1;
      }
      if (row.status === "ordered") {
        openOwed += Number(row.total_cents);
      }
      if (row.status === "received" && row.received_at) {
        const rec = new Date(row.received_at);
        if (rec.getTime() >= startOfMonth.getTime()) {
          thisMonthSpend += Number(row.total_cents);
        }
      }
    }
    return { openPos, openOwed, thisMonthSpend };
  }, [items]);

  return (
    <div className="po">
      <header className="po-head">
        <div className="po-head-text">
          <div className="po-kicker">{t("kicker")}</div>
          <h1 className="po-title">{t("title")}</h1>
          <p className="po-subtitle">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <a className="po-btn po-btn-primary" href={`/${locale}/purchases/new`}>
            <Plus size={14} strokeWidth={1.5} /> {t("newPo")}
          </a>
        )}
      </header>

      <div className="po-hero">
        <div className="po-hero-cell">
          <div className="po-hero-label">{t("hero.openPos")}</div>
          <div className="po-hero-value">{hero.openPos}</div>
        </div>
        <div className="po-hero-cell">
          <div className="po-hero-label">{t("hero.openOwed")}</div>
          <div className="po-hero-value">
            {formatCurrency(minorToMajor(hero.openOwed, tenantCurrency), tenantCurrency, locale)}
          </div>
        </div>
        <div className="po-hero-cell">
          <div className="po-hero-label">{t("hero.thisMonthSpend")}</div>
          <div className="po-hero-value">
            {formatCurrency(minorToMajor(hero.thisMonthSpend, tenantCurrency), tenantCurrency, locale)}
          </div>
        </div>
      </div>

      <div className="po-tabs">
        {TABS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`po-tab ${tab === s.id ? "po-tab-active" : ""}`}
            onClick={() => setTab(s.id)}
          >
            {t(s.key)}
          </button>
        ))}
      </div>

      <div className="po-toolbar">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          aria-label={t("filters.supplier")}
        >
          <option value="">{t("filters.allSuppliers")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {pickName(s.name_i18n, locale)}
            </option>
          ))}
        </select>
        {isManager ? (
          myBranch ? (
            <span className="po-branch-badge">
              {pickName(myBranch.name_i18n, locale)} · {myBranch.code}
            </span>
          ) : null
        ) : (
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label={t("filters.branch")}
          >
            <option value="">{t("filters.allBranches")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {pickName(b.name_i18n, locale)}
              </option>
            ))}
          </select>
        )}
      </div>

      {q.isPending ? (
        <div className="po-skeleton">{t("loading")}</div>
      ) : q.isError ? (
        <div className="po-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button type="button" className="po-btn" onClick={() => void q.refetch()}>
            {t("error.retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="po-empty">
          <h2 className="po-empty-title">{t(`empty.${tab}`)}</h2>
          <p className="po-empty-body">{t("empty.body")}</p>
          {canCreate && (
            <a className="po-btn po-btn-primary" href={`/${locale}/purchases/new`}>
              {t("newPo")}
            </a>
          )}
        </div>
      ) : (
        <div className="po-table-wrap">
          <table className="po-table">
            <thead>
              <tr>
                <th>{t("columns.code")}</th>
                <th>{t("columns.supplier")}</th>
                <th>{t("columns.branch")}</th>
                <th>{t("columns.created")}</th>
                <th>{t("columns.expected")}</th>
                <th>{t("columns.status")}</th>
                <th className="po-table-num-th">{t("columns.total")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    window.location.href = `/${locale}/purchases/${r.id}`;
                  }}
                >
                  <td>
                    <span className="po-table-code">{r.code}</span>
                  </td>
                  <td>
                    <div>{pickName(r.supplier.name_i18n, locale)}</div>
                    <div className="po-table-sub">{r.supplier.code}</div>
                  </td>
                  <td>
                    <div>{pickName(r.branch.name_i18n, locale)}</div>
                    {r.branch.code && (
                      <div className="po-table-sub">{r.branch.code}</div>
                    )}
                  </td>
                  <td>{fmtCreated(r.created_at, locale)}</td>
                  <td>{fmtDate(r.expected_at, locale)}</td>
                  <td>
                    <POStatusPill status={r.status} />
                    {r.has_discrepancy && (
                      <span
                        className="po-discrepancy-icon"
                        title={t("columns.discrepancyTooltip")}
                        aria-label={t("columns.discrepancyTooltip")}
                      >
                        <AlertTriangle size={14} strokeWidth={1.5} />
                      </span>
                    )}
                  </td>
                  <td className="po-table-num">
                    {formatCurrency(
                      minorToMajor(r.total_cents, r.currency_code),
                      r.currency_code,
                      locale,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
