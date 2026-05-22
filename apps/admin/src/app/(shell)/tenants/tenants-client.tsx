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

const STATUSES: Array<{ value: TenantStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "trialing", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "grace_period", label: "In grace" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
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
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30);
  return `${months} mo ago`;
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
    const set = new Set<string>(query.data.items.map((t) => t.country_code));
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
          <span className="admin-kpi-kicker">Tenants · all plans</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            All tenants
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
            {s.label}
          </button>
        ))}
        <span className="admin-filter-divider" />
        <select
          className="admin-select"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          aria-label="Filter by country"
        >
          <option value="">All countries</option>
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
          placeholder="Tenant name or slug…"
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
                <th style={{ width: 44 }} aria-label="Avatar" />
                <th>Tenant</th>
                <th>Country</th>
                <th>Plan</th>
                <th>Branches</th>
                <th>Users</th>
                <th className="right">MRR</th>
                <th>Status</th>
                <th>Last activity</th>
                <th>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id} style={{ cursor: "pointer" }}>
                  <td>
                    <span className="admin-tenant-avatar">
                      {t.name.slice(0, 1).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/tenants/${t.id}`}
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <div className="admin-tenant-name">{t.name}</div>
                      <div className="admin-tenant-slug">{t.slug}</div>
                    </Link>
                  </td>
                  <td>
                    <span style={{ marginInlineEnd: 6 }}>{countryFlag(t.country_code)}</span>
                    {countryName(t.country_code)}
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{t.plan.code}</td>
                  <td>{t.branch_count}</td>
                  <td>{t.user_count}</td>
                  <td className="right">{formatCents(t.mrr_cents, t.currency_code)}</td>
                  <td>
                    <StatusChip status={t.status} />
                  </td>
                  <td>{relativeTime(t.last_activity_at)}</td>
                  <td>
                    {new Intl.DateTimeFormat("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }).format(new Date(t.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>
              Page {data.page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={data.page >= totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
