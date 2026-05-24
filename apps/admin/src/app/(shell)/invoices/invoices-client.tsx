"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminListInvoices, type AdminInvoiceItem } from "@/lib/api/admin-invoices";
import { t } from "@/lib/i18n";

const STATUSES = [
  { value: "", label: t("invoices.statuses.all") },
  { value: "awaiting_payment", label: t("invoices.statuses.awaiting") },
  { value: "in_review", label: t("invoices.statuses.inReview") },
  { value: "paid", label: t("invoices.statuses.paid") },
  { value: "overdue", label: t("invoices.statuses.overdue") },
] as const;

const STATUS_TONE: Record<string, { color: string; bg: string }> = {
  paid: { color: "var(--sage)", bg: "color-mix(in oklab, var(--sage) 14%, transparent)" },
  awaiting_payment: { color: "var(--amber)", bg: "color-mix(in oklab, var(--amber) 14%, transparent)" },
  in_review: { color: "var(--accent)", bg: "color-mix(in oklab, var(--accent) 14%, transparent)" },
  overdue: { color: "var(--rose)", bg: "color-mix(in oklab, var(--rose) 14%, transparent)" },
  draft: { color: "var(--ink-3)", bg: "transparent" },
  cancelled: { color: "var(--ink-3)", bg: "transparent" },
};

function formatCents(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(major);
}

function overdueTone(days: number): string {
  if (days === 0) return "var(--sage)";
  if (days <= 7) return "var(--amber)";
  return "var(--rose)";
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function InvoicesClient() {
  const [status, setStatus] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [status, search]);

  const query = useQuery({
    queryKey: ["admin", "invoices", { status, search, page }],
    queryFn: () => adminListInvoices({ status: status || undefined, search: search || undefined, page, limit: 50 }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  if (query.isPending) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("invoices.loading")}</div>;
  }
  if (query.isError) {
    return <div style={{ padding: 40, color: "var(--rose)" }}>{t("invoices.errorLoad")}</div>;
  }

  const data = query.data;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">{t("invoices.kicker")}</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            {t("invoices.title")}
          </h1>
          <p className="admin-page-sub">
            {data.total} invoice{data.total === 1 ? "" : "s"} matching your filters.
          </p>
        </div>
      </header>

      <div className="admin-filter-row">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={status === s.value ? "admin-chip admin-chip-active" : "admin-chip"}
            onClick={() => setStatus(s.value)}
          >
            {s.label}
          </button>
        ))}
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("invoices.searchPlaceholder")}
          className="admin-search"
        />
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("invoices.table.invoice")}</th>
            <th>{t("invoices.table.tenant")}</th>
            <th>{t("invoices.table.plan")}</th>
            <th style={{ textAlign: "end" }}>{t("invoices.table.amount")}</th>
            <th>{t("invoices.table.issuedDue")}</th>
            <th>{t("invoices.table.status")}</th>
            <th style={{ textAlign: "end" }}>{t("invoices.table.daysOverdue")}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((inv: AdminInvoiceItem) => {
            const tone = STATUS_TONE[inv.status] ?? STATUS_TONE.draft!;
            return (
              <tr key={inv.id}>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{inv.reference_code}</td>
                <td>
                  <Link href={`/tenants/${inv.tenant.id}`} style={{ color: "inherit" }}>
                    <div className="admin-tenant-name">{inv.tenant.name}</div>
                    <div className="admin-tenant-slug">{inv.tenant.slug}</div>
                  </Link>
                </td>
                <td style={{ textTransform: "capitalize" }}>{inv.plan.code}</td>
                <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>
                  {formatCents(inv.amount_cents, inv.currency_code)}
                </td>
                <td style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {inv.period_start} → {inv.period_end}
                  <br />
                  <span style={{ color: "var(--ink-2)" }}>Due {inv.due_date}</span>
                </td>
                <td>
                  <span
                    style={{
                      color: tone.color,
                      background: tone.bg,
                      padding: "2px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      textTransform: "capitalize",
                    }}
                  >
                    {inv.status.replace("_", " ")}
                  </span>
                </td>
                <td style={{ textAlign: "end", color: overdueTone(inv.days_overdue), fontWeight: 500 }}>
                  {inv.status === "paid" ? "—" : inv.days_overdue}
                </td>
              </tr>
            );
          })}
          {data.items.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}>
                {t("invoices.empty")}
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
          {t("invoices.pagination.previous")}
        </button>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={data.page >= totalPages}>
          {t("invoices.pagination.next")}
        </button>
      </div>
    </>
  );
}
