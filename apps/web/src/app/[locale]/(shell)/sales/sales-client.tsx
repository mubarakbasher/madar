"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  salesListRequest,
  type SaleSummary,
  type SalesListQuery,
} from "@/lib/api/sales";
import { branchesListRequest } from "@/lib/api/branches";
import {
  useBranchScopeStore,
  branchScopeParam,
} from "@/lib/branch-scope/store";
import { currencyMinorUnits, formatMoney, minorToMajor } from "@/lib/currency";

type Status = "all" | "paid" | "payment_pending" | "disputed" | "refunded";
type Method =
  | "all"
  | "cash"
  | "card"
  | "bank_transfer"
  | "store_credit"
  | "split";

function fmtMoney(cents: string, currency: string, locale: "en" | "ar"): string {
  try {
    return formatMoney(cents, currency, locale);
  } catch {
    return `${currency} ${minorToMajor(cents, currency).toFixed(currencyMinorUnits(currency))}`;
  }
}

function fmtDate(iso: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function weekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function SalesListClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("salesList");
  const selectedBranch = useBranchScopeStore((s) => s.selectedBranchId);

  const [status, setStatus] = useState<Status>("all");
  const [method, setMethod] = useState<Method>("all");
  const [from, setFrom] = useState(weekAgoIso());
  const [to, setTo] = useState(todayIso());
  const [branchOverride, setBranchOverride] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 50;

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "for-sales"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });

  const branchId = branchOverride || branchScopeParam(selectedBranch);

  const queryArgs: SalesListQuery = useMemo(
    () => ({
      branch_id: branchId,
      payment_status: status === "all" ? undefined : status,
      payment_method: method === "all" ? undefined : method,
      from: from ? `${from}T00:00:00Z` : undefined,
      to: to ? `${to}T23:59:59Z` : undefined,
      page,
      limit,
    }),
    [branchId, status, method, from, to, page],
  );

  const salesQ = useQuery({
    queryKey: ["sales", "list", queryArgs],
    queryFn: () => salesListRequest(queryArgs),
    staleTime: 15_000,
  });

  const totalPages = salesQ.data
    ? Math.max(1, Math.ceil(salesQ.data.total / limit))
    : 1;

  return (
    <div className="sl-page">
      <header className="sl-header">
        <div className="sl-kicker">{t("kicker")}</div>
        <h1 className="sl-title">{t("title")}</h1>
        <p className="sl-subtitle">{t("subtitle")}</p>
      </header>

      <div className="sl-filters">
        <div className="sl-field">
          <label className="sl-label" htmlFor="sl-from">{t("filters.from")}</label>
          <input
            id="sl-from"
            type="date"
            className="sl-input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sl-field">
          <label className="sl-label" htmlFor="sl-to">{t("filters.to")}</label>
          <input
            id="sl-to"
            type="date"
            className="sl-input"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sl-field">
          <label className="sl-label" htmlFor="sl-branch">{t("filters.branch")}</label>
          <select
            id="sl-branch"
            className="sl-select"
            value={branchOverride}
            onChange={(e) => {
              setBranchOverride(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("filters.allBranches")}</option>
            {(branchesQ.data?.items ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name_i18n[locale] || b.name_i18n.en}
              </option>
            ))}
          </select>
        </div>
        <div className="sl-field">
          <label className="sl-label" htmlFor="sl-method">{t("filters.method")}</label>
          <select
            id="sl-method"
            className="sl-select"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as Method);
              setPage(1);
            }}
          >
            <option value="all">{t("filters.allMethods")}</option>
            <option value="cash">{t("methods.cash")}</option>
            <option value="card">{t("methods.card")}</option>
            <option value="bank_transfer">{t("methods.bank_transfer")}</option>
            <option value="store_credit">{t("methods.store_credit")}</option>
            <option value="split">{t("methods.split")}</option>
          </select>
        </div>
      </div>

      <div className="sl-chips" style={{ marginBlockEnd: 16 }}>
        {(["all", "paid", "payment_pending", "disputed", "refunded"] as const).map(
          (s) => (
            <button
              key={s}
              type="button"
              className={`sl-chip ${status === s ? "sl-chip-active" : ""}`}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {t(`statuses.${s}`)}
            </button>
          ),
        )}
      </div>

      {salesQ.isPending ? (
        <div className="sl-empty">{t("loading")}</div>
      ) : salesQ.isError ? (
        <div className="sl-empty" style={{ color: "var(--rose)" }}>
          {t("error")}
        </div>
      ) : salesQ.data.items.length === 0 ? (
        <div className="sl-empty">
          <div className="sl-empty-title">{t("emptyTitle")}</div>
          <div>{t("emptyBody")}</div>
        </div>
      ) : (
        <>
          <table className="sl-table">
            <thead>
              <tr>
                <th>{t("columns.code")}</th>
                <th>{t("columns.date")}</th>
                <th>{t("columns.branch")}</th>
                <th>{t("columns.cashier")}</th>
                <th className="sl-num">{t("columns.items")}</th>
                <th className="sl-num">{t("columns.total")}</th>
                <th>{t("columns.method")}</th>
                <th>{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {salesQ.data.items.map((s: SaleSummary) => (
                <tr
                  key={s.id}
                  onClick={() => {
                    window.location.assign(`/${locale}/sales/${s.id}/receipt`);
                  }}
                >
                  <td className="sl-code">{s.code}</td>
                  <td>{fmtDate(s.occurred_at, locale)}</td>
                  <td>{s.branch_code}</td>
                  <td>{s.cashier_name ?? "—"}</td>
                  <td className="sl-num">{s.line_count}</td>
                  <td className="sl-num">{fmtMoney(s.total_cents, s.currency_code, locale)}</td>
                  <td className="sl-method">{t(`methods.${s.payment_method}`)}</td>
                  <td>
                    <span className={`sl-pill sl-pill-${statusToken(s.payment_status)}`}>
                      {t(`statuses.${s.payment_status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sl-pagination">
            <span>
              {t("pagination.summary", {
                shown: salesQ.data.items.length,
                total: salesQ.data.total,
              })}
            </span>
            <div className="sl-page-btns">
              <button
                type="button"
                className="sl-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label={t("pagination.prev")}
              >
                <ChevronLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
                {t("pagination.prev")}
              </button>
              <span>
                {t("pagination.page", { page, total: totalPages })}
              </span>
              <button
                type="button"
                className="sl-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label={t("pagination.next")}
              >
                {t("pagination.next")}
                <ChevronRight size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function statusToken(s: SaleSummary["payment_status"]): string {
  switch (s) {
    case "paid":
      return "paid";
    case "payment_pending":
      return "pending";
    case "disputed":
      return "disputed";
    case "refunded":
      return "refunded";
  }
}
