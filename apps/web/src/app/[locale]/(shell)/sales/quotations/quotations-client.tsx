"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import {
  quotationsListRequest,
  type ApiQuotationSummary,
} from "@/lib/api/quotations";
import { branchesListRequest } from "@/lib/api/branches";
import {
  useBranchScopeStore,
  branchScopeParam,
} from "@/lib/branch-scope/store";
import { currencyMinorUnits, formatMoney, minorToMajor } from "@/lib/currency";
import { useFormat } from "@/lib/i18n/format";

type StatusFilter = "all" | "open" | "expired" | "converted" | "cancelled";

function fmtMoney(cents: string, currency: string, locale: string): string {
  try {
    return formatMoney(cents, currency, locale);
  } catch {
    return `${currency} ${minorToMajor(cents, currency).toFixed(currencyMinorUnits(currency))}`;
  }
}

function fmtDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function pillToken(status: string): string {
  switch (status) {
    case "open":
      return "open";
    case "expired":
      return "expired";
    case "converted":
      return "converted";
    case "cancelled":
      return "cancelled";
    default:
      return "open";
  }
}

export function QuotationsListClient({ locale }: { locale: "en" | "ar" }) {
  const f = useFormat();
  const t = useTranslations("quotationsList");
  const selectedBranch = useBranchScopeStore((s) => s.selectedBranchId);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [branchOverride, setBranchOverride] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 50;

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "for-quotations"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });

  // The quotations endpoint requires a concrete branch_id (unlike sales
  // history, which tolerates "all"). Fall back to the first branch once the
  // list loads if the user hasn't picked "All branches" scope explicitly.
  const scoped = branchScopeParam(selectedBranch);
  const branchId =
    branchOverride || scoped || branchesQ.data?.items[0]?.id || "";

  useEffect(() => {
    setPage(1);
  }, [branchId, status]);

  const queryArgs = useMemo(
    () => ({
      branchId,
      status: status === "all" ? undefined : status,
      page,
      limit,
    }),
    [branchId, status, page],
  );

  const quotationsQ = useQuery({
    queryKey: ["quotations", branchId, { status, page, limit }],
    queryFn: () => quotationsListRequest(queryArgs),
    enabled: !!branchId,
    staleTime: 15_000,
  });

  const totalPages = quotationsQ.data
    ? Math.max(1, Math.ceil(quotationsQ.data.total / limit))
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
          <label className="sl-label" htmlFor="qt-branch">
            {t("filters.branch")}
          </label>
          <select
            id="qt-branch"
            className="sl-select"
            value={branchOverride}
            onChange={(e) => setBranchOverride(e.target.value)}
          >
            {(branchesQ.data?.items ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name_i18n[locale] || b.name_i18n.en}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sl-chips" style={{ marginBlockEnd: "var(--space-4)" }}>
        {(["all", "open", "expired", "converted", "cancelled"] as const).map(
          (s) => (
            <button
              key={s}
              type="button"
              className={`sl-chip ${status === s ? "sl-chip-active" : ""}`}
              onClick={() => setStatus(s)}
            >
              {t(`statuses.${s}`)}
            </button>
          ),
        )}
      </div>

      {!branchId ? (
        <div className="sl-empty">{t("loading")}</div>
      ) : quotationsQ.isPending ? (
        <div className="sl-empty">{t("loading")}</div>
      ) : quotationsQ.isError ? (
        <div className="sl-empty" style={{ color: "var(--rose)" }}>
          {t("error")}
        </div>
      ) : quotationsQ.data.items.length === 0 ? (
        <div className="sl-empty">
          <FileText
            size={40}
            strokeWidth={1.5}
            style={{ color: "var(--ink-3)", marginBlockEnd: "var(--space-3)" }}
          />
          <div className="sl-empty-title">{t("emptyTitle")}</div>
          <div>{t("emptyBody")}</div>
          <a
            href={`/${locale}/pos`}
            className="qt-btn qt-btn-primary"
            style={{ marginBlockStart: "var(--space-4)", display: "inline-flex" }}
          >
            {t("emptyCta")}
          </a>
        </div>
      ) : (
        <>
          <table className="sl-table">
            <thead>
              <tr>
                <th>{t("columns.code")}</th>
                <th>{t("columns.customer")}</th>
                <th className="sl-num">{t("columns.total")}</th>
                <th>{t("columns.validUntil")}</th>
                <th>{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {quotationsQ.data.items.map((q: ApiQuotationSummary) => (
                <tr
                  key={q.id}
                  onClick={() => {
                    window.location.assign(
                      `/${locale}/sales/quotations/${q.id}`,
                    );
                  }}
                >
                  <td className="sl-code">{q.code}</td>
                  <td>{q.customer_name ?? t("noCustomer")}</td>
                  <td className="sl-num">
                    {fmtMoney(q.total_cents, q.currency_code, f.locale)}
                  </td>
                  <td>{fmtDate(q.valid_until, f.locale)}</td>
                  <td>
                    <span
                      className={`sl-pill qt-pill-${pillToken(q.effective_status)}`}
                    >
                      {t(`statuses.${q.effective_status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sl-pagination">
            <span>
              {t("pagination.summary", {
                shown: quotationsQ.data.items.length,
                total: quotationsQ.data.total,
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
              <span>{t("pagination.page", { page, total: totalPages })}</span>
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
