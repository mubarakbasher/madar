"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { adminListPlatformAudit } from "@/lib/api/admin-audit";
import { t } from "@/lib/i18n";

function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function PlatformAuditClient() {
  const [page, setPage] = useState(1);
  const [actionInput, setActionInput] = useState("");
  const actionPrefix = useDebounced(actionInput, 300);

  useEffect(() => setPage(1), [actionPrefix]);

  const query = useQuery({
    queryKey: ["admin", "platform-audit", { actionPrefix, page }],
    queryFn: () =>
      adminListPlatformAudit({
        action_prefix: actionPrefix || undefined,
        page,
        limit: 50,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  if (query.isPending) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("platformAudit.loading")}</div>;
  }
  if (query.isError) {
    return <div style={{ padding: 40, color: "var(--rose)" }}>{t("platformAudit.errorLoad")}</div>;
  }

  const data = query.data;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">{t("platformAudit.kicker")}</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            {t("platformAudit.title")}
          </h1>
          <p className="admin-page-sub">
            Append-only record of every super-admin action. {data.total} event
            {data.total === 1 ? "" : "s"}.
          </p>
        </div>
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
          padding: "12px 14px",
          background: "color-mix(in oklab, var(--amber) 10%, transparent)",
          border: "1px solid color-mix(in oklab, var(--amber) 22%, transparent)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--ink-2)",
        }}
      >
        <ShieldAlert size={16} strokeWidth={1.5} style={{ color: "var(--amber)", flexShrink: 0 }} />
        <span>
          {t("platformAudit.infoBanner")}
        </span>
      </div>

      <div className="admin-filter-row">
        <input
          type="search"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          placeholder={t("platformAudit.filterPlaceholder")}
          className="admin-search"
          style={{ minWidth: 320 }}
        />
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("platformAudit.table.timestamp")}</th>
            <th>{t("platformAudit.table.superAdmin")}</th>
            <th>{t("platformAudit.table.action")}</th>
            <th>{t("platformAudit.table.targetTenant")}</th>
            <th>{t("platformAudit.table.ip")}</th>
            <th>{t("platformAudit.table.reason")}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((row) => (
            <tr key={row.id}>
              <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                {shortDateTime(row.created_at)}
              </td>
              <td>
                <div className="admin-tenant-name">{row.platform_user.name}</div>
                <div className="admin-tenant-slug">{row.platform_user.email}</div>
              </td>
              <td>
                <code
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    background: "var(--bg)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--rule)",
                  }}
                >
                  {row.action}
                </code>
              </td>
              <td>
                {row.target_tenant ? (
                  <Link href={`/tenants/${row.target_tenant.id}`} style={{ color: "inherit" }}>
                    {row.target_tenant.name}
                  </Link>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>—</span>
                )}
              </td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
                {row.ip ?? "—"}
              </td>
              <td style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 240 }}>
                {row.reason ?? "—"}
              </td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}>
                {t("platformAudit.empty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="admin-pagination">
        <span>
          Page {data.page} of {totalPages}
        </span>
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page <= 1}>
          {t("platformAudit.pagination.previous")}
        </button>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={data.page >= totalPages}>
          {t("platformAudit.pagination.next")}
        </button>
      </div>
    </>
  );
}
