"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  adminListTenants,
  type ListTenantsResponse,
  type TenantStatus,
} from "@/lib/api/admin-tenants";
import { countryFlag, countryName, COUNTRY_MAP } from "../_components/country-map";
import { StatusChip } from "../_components/StatusChip";
import { TenantsSkeleton } from "../_components/TenantsSkeleton";
import { TenantsEmpty } from "../_components/TenantsEmpty";
import { TenantsError } from "../_components/TenantsError";
import { t } from "@/lib/i18n";

const STATUSES: Array<{ value: TenantStatus | "all"; labelKey: "all" | "trial" | "active" | "inGrace" | "suspended" | "cancelled" }> = [
  { value: "all", labelKey: "all" },
  { value: "trialing", labelKey: "trial" },
  { value: "active", labelKey: "active" },
  { value: "grace_period", labelKey: "inGrace" },
  { value: "suspended", labelKey: "suspended" },
  { value: "cancelled", labelKey: "cancelled" },
];

const PAGE_SIZE = 50;

function formatCents(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(major);
}

function relativeTime(iso: string | null): string {
  if (!iso) return t("common.noData");
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return t("common.justNow");
  if (minutes < 60) return t("common.minAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("common.hAgo", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t("common.dAgo", { count: days });
  const months = Math.round(days / 30);
  return t("common.moAgo", { count: months });
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function TenantsClient() {
  const [status, setStatus] = useState<TenantStatus | "all">("all");
  const [country, setCountry] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [status, country, search]);

  const query = useQuery<ListTenantsResponse>({
    queryKey: ["admin", "tenants", { status, country, search, page }],
    queryFn: () =>
      adminListTenants({
        status: status === "all" ? undefined : status,
        country_code: country || undefined,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const countriesInResults = useMemo(() => {
    if (!query.data) return [];
    const set = new Set<string>(query.data.items.map((tn) => tn.country_code));
    return [...set].sort();
  }, [query.data]);

  if (query.isPending) return <TenantsSkeleton />;

  if (query.isError) {
    return <TenantsError onRetry={() => void query.refetch()} />;
  }

  const data = query.data;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const filtered = status !== "all" || country !== "" || search.length > 0;

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">{t("tenants.kicker")}</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            {t("tenants.title")}
          </h1>
          <p className="admin-page-sub">
            {data.total} matching · across {data.total_countries} countr
            {data.total_countries === 1 ? "y" : "ies"}
          </p>
        </div>
      </header>

      <div className="admin-filter-row">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className="admin-chip"
            aria-pressed={status === s.value}
            onClick={() => setStatus(s.value)}
          >
            {t(`tenants.statusFilter.${s.labelKey}`)}
          </button>
        ))}
        <span className="admin-filter-divider" />
        <select
          className="admin-select"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          aria-label={t("tenants.filterByCountry")}
        >
          <option value="">{t("tenants.allCountries")}</option>
          {countriesInResults.map((c) => (
            <option key={c} value={c}>
              {countryFlag(c)} {countryName(c)}
            </option>
          ))}
          {/* Allow filtering to other countries even if absent from the
              current page — fixed set from the inline map. */}
          {Object.keys(COUNTRY_MAP)
            .filter((c) => !countriesInResults.includes(c))
            .map((c) => (
              <option key={c} value={c}>
                {countryFlag(c)} {countryName(c)}
              </option>
            ))}
        </select>
        <input
          type="search"
          className="admin-search-input"
          placeholder={t("tenants.searchPlaceholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {data.items.length === 0 ? (
        <TenantsEmpty filtered={filtered} />
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 44 }} aria-label={t("tenants.table.avatar")} />
                <th>{t("tenants.table.tenant")}</th>
                <th>{t("tenants.table.country")}</th>
                <th>{t("tenants.table.plan")}</th>
                <th>{t("tenants.table.branches")}</th>
                <th>{t("tenants.table.users")}</th>
                <th className="right">{t("tenants.table.mrr")}</th>
                <th>{t("tenants.table.status")}</th>
                <th>{t("tenants.table.lastActivity")}</th>
                <th>{t("tenants.table.signedUp")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((tenant) => (
                <tr key={tenant.id} style={{ cursor: "pointer" }}>
                  <td>
                    <span className="admin-tenant-avatar">
                      {tenant.name.slice(0, 1).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/tenants/${tenant.id}`}
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <div className="admin-tenant-name">{tenant.name}</div>
                      <div className="admin-tenant-slug">{tenant.slug}</div>
                    </Link>
                  </td>
                  <td>
                    <span style={{ marginInlineEnd: 6 }}>{countryFlag(tenant.country_code)}</span>
                    {countryName(tenant.country_code)}
                  </td>
                  <td style={{ textTransform: "capitalize" }}>
                    {tenant.plan ? tenant.plan.code : <span style={{ color: "var(--ink-4)" }}>{t("tenants.noPlan")}</span>}
                  </td>
                  <td>{tenant.branch_count}</td>
                  <td>{tenant.user_count}</td>
                  <td className="right">{formatCents(tenant.mrr_cents, tenant.currency_code)}</td>
                  <td>
                    <StatusChip status={tenant.status} />
                  </td>
                  <td>{relativeTime(tenant.last_activity_at)}</td>
                  <td>
                    {new Intl.DateTimeFormat("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }).format(new Date(tenant.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>
              {t("tenants.pagination.page", { page: data.page, totalPages })}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1}
            >
              {t("tenants.pagination.previous")}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={data.page >= totalPages}
            >
              {t("tenants.pagination.next")}
            </button>
          </div>
        </>
      )}
    </>
  );
}
