"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminListLoginAs } from "@/lib/api/admin-audit";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Active";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LoginAuditClient() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "login-audit", page],
    queryFn: () => adminListLoginAs({ page, limit: 50 }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  if (query.isPending) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>Loading sessions…</div>;
  }
  if (query.isError) {
    return <div style={{ padding: 40, color: "var(--rose)" }}>Could not load login-as sessions.</div>;
  }

  const data = query.data;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">Security · impersonation</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            Login-as audit
          </h1>
          <p className="admin-page-sub">
            Every time a super-admin signed in as a tenant user. {data.total} session
            {data.total === 1 ? "" : "s"}.
          </p>
        </div>
      </header>

      <div
        style={{
          marginBottom: 16,
          padding: "10px 14px",
          background: "color-mix(in oklab, var(--amber) 10%, transparent)",
          border: "1px solid color-mix(in oklab, var(--amber) 22%, transparent)",
          borderRadius: 10,
          fontSize: 12,
          color: "var(--ink-2)",
        }}
      >
        Append-only. Each session writes one row when started, one when ended. Action counts come
        from <code style={{ fontFamily: "var(--mono)" }}>audit_log</code> rows tagged with{" "}
        <code style={{ fontFamily: "var(--mono)" }}>impersonator_id</code>.
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Started</th>
            <th>Super-admin</th>
            <th>Tenant</th>
            <th>Duration</th>
            <th style={{ textAlign: "end" }}>Actions</th>
            <th>Reason</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((s) => (
            <tr key={s.id}>
              <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                {shortDateTime(s.started_at)}
              </td>
              <td>
                <div className="admin-tenant-name">{s.platform_user.name}</div>
                <div className="admin-tenant-slug">{s.platform_user.email}</div>
              </td>
              <td>
                {s.target_tenant.id ? (
                  <Link href={`/tenants/${s.target_tenant.id}`} style={{ color: "inherit" }}>
                    <div className="admin-tenant-name">{s.target_tenant.name}</div>
                    <div className="admin-tenant-slug">{s.target_tenant.slug}</div>
                  </Link>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>{s.target_tenant.name}</span>
                )}
              </td>
              <td
                style={{
                  fontSize: 13,
                  color: s.ended_at ? "var(--ink)" : "var(--accent)",
                  fontWeight: s.ended_at ? "normal" : 500,
                }}
              >
                {formatDuration(s.duration_seconds)}
              </td>
              <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>
                {s.actions_count}
              </td>
              <td style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 280 }}>
                {s.reason ?? "—"}
              </td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
                {s.ip ?? "—"}
              </td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}>
                No impersonation sessions recorded yet.
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
          Previous
        </button>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={data.page >= totalPages}>
          Next
        </button>
      </div>
    </>
  );
}
