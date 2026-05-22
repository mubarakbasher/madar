"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  stockMovementsListRequest,
  type ApiStockMovement,
  type StockMovementKind,
  type StockMovementsQuery,
} from "@/lib/api/stock-movements";
import { branchesListRequest } from "@/lib/api/branches";
import { approversListRequest } from "@/lib/api/users";
import {
  useBranchScopeStore,
  branchScopeParam,
} from "@/lib/branch-scope/store";
import { useAuthStore } from "@/lib/auth/store";

type KindFilter = "all" | StockMovementKind;

const KIND_OPTIONS: KindFilter[] = [
  "all",
  "sale",
  "return_in",
  "transfer_in",
  "transfer_out",
  "adjustment",
  "receive",
  "waste",
];

function fmtDate(iso: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function fmtMoney(cents: string | null, currency: string, locale: "en" | "ar"): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency,
    }).format(Number(cents) / 100);
  } catch {
    return `${currency} ${(Number(cents) / 100).toFixed(2)}`;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function weekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function pickName(
  i18n: { en: string; ar: string } | null,
  fallbackEn: string,
  locale: "en" | "ar",
): string {
  if (!i18n) return fallbackEn || "";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function referenceHref(
  m: Pick<ApiStockMovement, "reference_table" | "reference_id">,
  locale: "en" | "ar",
): string | null {
  if (!m.reference_table || !m.reference_id) return null;
  switch (m.reference_table) {
    case "sales":
    case "sale_refunds":
      return `/${locale}/sales/${m.reference_id}/receipt`;
    case "stock_transfers":
      return `/${locale}/transfers/${m.reference_id}`;
    case "purchase_orders":
      return `/${locale}/purchases/${m.reference_id}`;
    case "supplier_returns":
      return `/${locale}/returns/${m.reference_id}`;
    default:
      return null;
  }
}

export function MovementsClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("inventory.movements");
  const tenant = useAuthStore((s) => s.tenant);
  const currency = tenant?.default_currency_code ?? "USD";
  const selectedBranch = useBranchScopeStore((s) => s.selectedBranchId);

  const [kind, setKind] = useState<KindFilter>("all");
  const [from, setFrom] = useState(weekAgoIso());
  const [to, setTo] = useState(todayIso());
  const [branchOverride, setBranchOverride] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 50;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const branchesQ = useQuery({
    queryKey: ["branches", "list", "for-movements"],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });

  // Open to any authed user; returns active owners + managers. Used as the
  // "User" filter dropdown — narrow but matches PAGES §18 minimum.
  const approversQ = useQuery({
    queryKey: ["users", "approvers", "for-movements"],
    queryFn: () => approversListRequest(),
    staleTime: 60_000,
  });

  const branchId = branchOverride || branchScopeParam(selectedBranch);

  const queryArgs: StockMovementsQuery = useMemo(
    () => ({
      branch_id: branchId,
      kind: kind === "all" ? undefined : kind,
      created_by: userFilter || undefined,
      from: from ? `${from}T00:00:00Z` : undefined,
      to: to ? `${to}T23:59:59Z` : undefined,
      page,
      limit,
    }),
    [branchId, kind, userFilter, from, to, page],
  );

  const movementsQ = useQuery({
    queryKey: ["stock-movements", queryArgs],
    queryFn: () => stockMovementsListRequest(queryArgs),
    staleTime: 15_000,
  });

  const totalPages = movementsQ.data
    ? Math.max(1, Math.ceil(movementsQ.data.total / limit))
    : 1;

  const selected = useMemo(
    () => movementsQ.data?.items.find((m) => m.id === selectedId) ?? null,
    [movementsQ.data, selectedId],
  );

  const selectedRefHref = selected ? referenceHref(selected, locale) : null;

  return (
    <div className="sm-page">
      <header className="sm-header">
        <div className="sm-kicker">{t("kicker")}</div>
        <h1 className="sm-title">{t("title")}</h1>
        <p className="sm-subtitle">{t("subtitle")}</p>
      </header>

      <div className="sm-filters">
        <div className="sm-field">
          <label className="sm-label" htmlFor="sm-from">{t("filters.from")}</label>
          <input
            id="sm-from"
            type="date"
            className="sm-input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sm-field">
          <label className="sm-label" htmlFor="sm-to">{t("filters.to")}</label>
          <input
            id="sm-to"
            type="date"
            className="sm-input"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sm-field">
          <label className="sm-label" htmlFor="sm-branch">{t("filters.branch")}</label>
          <select
            id="sm-branch"
            className="sm-select"
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
        <div className="sm-field">
          <label className="sm-label" htmlFor="sm-user">{t("filters.user")}</label>
          <select
            id="sm-user"
            className="sm-select"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("filters.allUsers")}</option>
            {(approversQ.data?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sm-chips">
        {KIND_OPTIONS.map((k) => (
          <button
            key={k}
            type="button"
            className={`sm-chip ${kind === k ? "sm-chip-active" : ""}`}
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
          >
            {t(`kindChips.${k}`)}
          </button>
        ))}
      </div>

      {movementsQ.isPending ? (
        <div className="sm-empty">{t("loading")}</div>
      ) : movementsQ.isError ? (
        <div className="sm-empty" style={{ color: "var(--rose)" }}>
          {t("error")}
        </div>
      ) : movementsQ.data.items.length === 0 ? (
        <div className="sm-empty">
          <div className="sm-empty-title">{t("emptyTitle")}</div>
          <div>{t("emptyBody")}</div>
        </div>
      ) : (
        <>
          <table className="sm-table">
            <thead>
              <tr>
                <th>{t("columns.time")}</th>
                <th>{t("columns.product")}</th>
                <th>{t("columns.branch")}</th>
                <th>{t("columns.type")}</th>
                <th className="sm-num">{t("columns.qty")}</th>
                <th>{t("columns.reason")}</th>
                <th>{t("columns.reference")}</th>
                <th>{t("columns.user")}</th>
              </tr>
            </thead>
            <tbody>
              {movementsQ.data.items.map((m) => {
                const href = referenceHref(m, locale);
                const name = pickName(m.product_name_i18n, m.product_name_en, locale);
                const noteShort =
                  m.note && m.note.length > 32 ? `${m.note.slice(0, 32)}…` : m.note ?? "—";
                return (
                  <tr
                    key={m.id}
                    aria-selected={selectedId === m.id}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <td>{fmtDate(m.occurred_at, locale)}</td>
                    <td>
                      <div className="sm-sku">{m.product_sku}</div>
                      <div>{name}</div>
                    </td>
                    <td>{m.branch_code}</td>
                    <td>
                      <span className={`sm-kind-chip sm-kind-${m.kind}`}>
                        {t(`kindChips.${m.kind}` as never)}
                      </span>
                    </td>
                    <td
                      className={`sm-num ${
                        m.qty_delta > 0
                          ? "sm-num-positive"
                          : m.qty_delta < 0
                            ? "sm-num-negative"
                            : ""
                      }`}
                    >
                      {m.qty_delta > 0 ? `+${m.qty_delta}` : m.qty_delta}
                    </td>
                    <td>{noteShort}</td>
                    <td>
                      {href ? (
                        <a
                          className="sm-ref-link"
                          href={href}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {m.reference_table}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{m.created_by_name ?? t("systemUser")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="sm-pagination">
            <span>
              {t("pagination.summary", {
                shown: movementsQ.data.items.length,
                total: movementsQ.data.total,
              })}
            </span>
            <div className="sm-page-btns">
              <button
                type="button"
                className="sm-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} strokeWidth={1.5} />
                {t("pagination.prev")}
              </button>
              <span>
                {t("pagination.page", { page, total: totalPages })}
              </span>
              <button
                type="button"
                className="sm-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("pagination.next")}
                <ChevronRight size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <>
          <div
            className="sm-drawer-bg"
            onClick={() => setSelectedId(null)}
            aria-hidden
          />
          <aside className="sm-drawer" role="dialog" aria-modal>
            <div className="sm-drawer-head">
              <div>
                <h2 className="sm-drawer-title">{t("drawer.title")}</h2>
                <div className="sm-drawer-when">{fmtDate(selected.occurred_at, locale)}</div>
              </div>
              <button
                type="button"
                className="sm-btn"
                onClick={() => setSelectedId(null)}
                aria-label={t("drawer.close")}
                style={{ padding: 6 }}
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <div className="sm-drawer-row">
                <span className="sm-drawer-key">{t("columns.type")}</span>
                <span className={`sm-kind-chip sm-kind-${selected.kind}`}>
                  {t(`kindChips.${selected.kind}` as never)}
                </span>
              </div>
              <div className="sm-drawer-row">
                <span className="sm-drawer-key">{t("columns.qty")}</span>
                <span
                  className={`sm-drawer-value ${
                    selected.qty_delta > 0
                      ? "sm-num-positive"
                      : selected.qty_delta < 0
                        ? "sm-num-negative"
                        : ""
                  }`}
                >
                  {selected.qty_delta > 0 ? `+${selected.qty_delta}` : selected.qty_delta}
                </span>
              </div>
              <div className="sm-drawer-row">
                <span className="sm-drawer-key">{t("columns.product")}</span>
                <span className="sm-drawer-value">
                  <div className="sm-sku">{selected.product_sku}</div>
                  <div>{pickName(selected.product_name_i18n, selected.product_name_en, locale)}</div>
                </span>
              </div>
              <div className="sm-drawer-row">
                <span className="sm-drawer-key">{t("columns.branch")}</span>
                <span className="sm-drawer-value">{selected.branch_code}</span>
              </div>
              <div className="sm-drawer-row">
                <span className="sm-drawer-key">{t("columns.user")}</span>
                <span className="sm-drawer-value">
                  {selected.created_by_name ?? t("systemUser")}
                </span>
              </div>
              <div className="sm-drawer-row">
                <span className="sm-drawer-key">{t("drawer.cost")}</span>
                <span className="sm-drawer-value">
                  {fmtMoney(selected.unit_cost_cents, currency, locale)}
                </span>
              </div>
              <div className="sm-drawer-row">
                <span className="sm-drawer-key">{t("columns.reason")}</span>
                <span className="sm-drawer-value">{selected.note ?? "—"}</span>
              </div>
              {selected.reference_table && (
                <div className="sm-drawer-row">
                  <span className="sm-drawer-key">{t("columns.reference")}</span>
                  <span className="sm-drawer-value">{selected.reference_table}</span>
                </div>
              )}
            </div>

            <div className="sm-drawer-actions">
              {selectedRefHref ? (
                <a className="sm-btn sm-btn-primary" href={selectedRefHref}>
                  {t("drawer.openLink")}
                </a>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="sm-btn"
                onClick={() => setSelectedId(null)}
              >
                {t("drawer.close")}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
