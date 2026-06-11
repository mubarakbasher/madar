"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  supplierReturnsListRequest,
  type ApiReturnSummary,
  type SupplierReturnStatus,
} from "@/lib/api/supplier-returns";
import { suppliersListRequest } from "@/lib/api/suppliers";
import { branchesListRequest } from "@/lib/api/branches";
import { useAuthStore } from "@/lib/auth/store";
import { formatCurrency, minorToMajor } from "@/lib/currency";
import { ReturnStatusPill } from "./_components/ReturnStatusPill";
import "./returns.css";

type Tab = SupplierReturnStatus | "all";

const TABS: {
  id: Tab;
  key:
    | "tabs.draft"
    | "tabs.sent"
    | "tabs.refunded"
    | "tabs.cancelled"
    | "tabs.all";
}[] = [
  { id: "draft", key: "tabs.draft" },
  { id: "sent", key: "tabs.sent" },
  { id: "refunded", key: "tabs.refunded" },
  { id: "cancelled", key: "tabs.cancelled" },
  { id: "all", key: "tabs.all" },
];

function pickName(
  i18n: { en: string; ar: string } | null,
  locale: string,
  fallbackCode: string | null = null,
): string {
  if (i18n) {
    const v = locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
    if (v) return v;
  }
  return fallbackCode ?? "—";
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

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function ReturnsClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("returns");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const userBranchId = useAuthStore((s) => s.user?.branch_id ?? null);
  const tenantCurrency =
    useAuthStore.getState().tenant?.default_currency_code ?? "USD";
  const canCreate = role === "owner" || role === "manager";
  const isManager = role === "manager";

  const [tab, setTab] = useState<Tab>("draft");
  const [supplierId, setSupplierId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");

  // Managers always see their branch — UI also passes it for clarity.
  const effectiveBranchId = isManager
    ? userBranchId || undefined
    : branchId || undefined;

  const q = useQuery({
    queryKey: [
      "supplier-returns",
      "list",
      { tab, supplierId, branchId: effectiveBranchId },
    ],
    queryFn: () =>
      supplierReturnsListRequest({
        status: tab === "all" ? undefined : tab,
        supplier_id: supplierId || undefined,
        branch_id: effectiveBranchId,
        limit: 100,
      }),
    staleTime: 15_000,
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers", "list", "for-rma-filter"],
    queryFn: () => suppliersListRequest({ active_only: true, limit: 200 }),
    staleTime: 60_000,
  });
  const suppliers = suppliersQ.data?.items ?? [];

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "for-rma-filter"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
    enabled: !isManager,
  });
  const branches = branchesQ.data?.items ?? [];
  const myBranch = isManager
    ? branches.find((b) => b.id === userBranchId) ?? null
    : null;

  const items: ApiReturnSummary[] = q.data?.items ?? [];

  // Hero KPIs — computed from the current filtered slice. Same precedent as
  // purchases-client. The list endpoint doesn't precompute globally so this
  // reflects what's on screen; replace with a dedicated aggregate later.
  // TODO(api): swap to a dedicated /supplier-returns/summary aggregate.
  const hero = useMemo(() => {
    let openReturns = 0;
    let refundPending = 0;
    let thisMonthRefunded = 0;
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    for (const row of items) {
      if (row.status === "draft" || row.status === "sent") {
        openReturns += 1;
      }
      if (row.status === "sent") {
        refundPending += Number(row.total_cents);
      }
      if (row.status === "refunded" && row.refunded_at) {
        const r = new Date(row.refunded_at);
        if (r.getTime() >= startOfMonth.getTime()) {
          thisMonthRefunded += Number(row.total_cents);
        }
      }
    }
    return { openReturns, refundPending, thisMonthRefunded };
  }, [items]);

  return (
    <div className="rma">
      <header className="rma-head">
        <div className="rma-head-text">
          <div className="rma-kicker">{t("kicker")}</div>
          <h1 className="rma-title">{t("title")}</h1>
          <p className="rma-subtitle">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <a className="rma-btn rma-btn-primary" href={`/${locale}/returns/new`}>
            <Plus size={14} strokeWidth={1.5} /> {t("newReturn")}
          </a>
        )}
      </header>

      <div className="rma-hero">
        <div className="rma-hero-cell">
          <div className="rma-hero-label">{t("hero.openReturns")}</div>
          <div className="rma-hero-value">{hero.openReturns}</div>
        </div>
        <div className="rma-hero-cell">
          <div className="rma-hero-label">{t("hero.refundPending")}</div>
          <div className="rma-hero-value">
            {formatCurrency(minorToMajor(hero.refundPending, tenantCurrency), tenantCurrency, locale)}
          </div>
        </div>
        <div className="rma-hero-cell">
          <div className="rma-hero-label">{t("hero.thisMonthRefunded")}</div>
          <div className="rma-hero-value">
            {formatCurrency(minorToMajor(hero.thisMonthRefunded, tenantCurrency), tenantCurrency, locale)}
          </div>
        </div>
      </div>

      <div className="rma-tabs">
        {TABS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rma-tab ${tab === s.id ? "rma-tab-active" : ""}`}
            onClick={() => setTab(s.id)}
          >
            {t(s.key)}
          </button>
        ))}
      </div>

      <div className="rma-toolbar">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          aria-label={t("filters.supplier")}
        >
          <option value="">{t("filters.allSuppliers")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {pickName(s.name_i18n, locale, s.code)}
            </option>
          ))}
        </select>
        {isManager ? (
          myBranch ? (
            <span className="rma-branch-badge">
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
        <div className="rma-skeleton">{t("loading")}</div>
      ) : q.isError ? (
        <div className="rma-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button
            type="button"
            className="rma-btn"
            onClick={() => void q.refetch()}
          >
            {t("error.retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rma-empty">
          <h2 className="rma-empty-title">{t(`empty.${tab}`)}</h2>
          <p className="rma-empty-body">{t("empty.body")}</p>
          {canCreate && (
            <a className="rma-btn rma-btn-primary" href={`/${locale}/returns/new`}>
              {t("newReturn")}
            </a>
          )}
        </div>
      ) : (
        <div className="rma-table-wrap">
          <table className="rma-table">
            <thead>
              <tr>
                <th>{t("columns.code")}</th>
                <th>{t("columns.supplier")}</th>
                <th>{t("columns.branch")}</th>
                <th>{t("columns.created")}</th>
                <th>{t("columns.reason")}</th>
                <th>{t("columns.status")}</th>
                <th className="rma-table-num-th">{t("columns.total")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    window.location.href = `/${locale}/returns/${r.id}`;
                  }}
                >
                  <td>
                    <span className="rma-table-code">{r.code}</span>
                  </td>
                  <td>
                    <div>
                      {pickName(r.supplier.name_i18n, locale, r.supplier.code)}
                    </div>
                    <div className="rma-table-sub">{r.supplier.code}</div>
                  </td>
                  <td>
                    <div>
                      {pickName(
                        r.branch.name_i18n,
                        locale,
                        r.branch.code ?? "—",
                      )}
                    </div>
                    {r.branch.code && (
                      <div className="rma-table-sub">{r.branch.code}</div>
                    )}
                  </td>
                  <td>{fmtCreated(r.created_at, locale)}</td>
                  <td>
                    <div className="rma-table-reason" title={r.reason}>
                      {truncate(r.reason, 40)}
                    </div>
                  </td>
                  <td>
                    <ReturnStatusPill status={r.status} />
                  </td>
                  <td className="rma-table-num">
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
