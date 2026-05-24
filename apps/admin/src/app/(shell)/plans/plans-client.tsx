"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus } from "lucide-react";
import {
  adminListPlans,
  adminSetPlanActive,
  type PlanResponse,
} from "@/lib/api/admin-plans";
import { useAdminAuthStore } from "@/lib/auth/store";
import { t } from "@/lib/i18n";

function formatCents(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: major % 1 === 0 ? 0 : 2,
  }).format(major);
}

function formatLimit(n: number): string {
  if (n === -1) return "∞";
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

export function PlansClient() {
  const user = useAdminAuthStore((s) => s.user);
  const isOwner = user?.role === "owner";
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);

  const query = useQuery<PlanResponse[]>({
    queryKey: ["admin", "plans", { includeInactive }],
    queryFn: () => adminListPlans(includeInactive),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminSetPlanActive(id, active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
  });

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">{t("plans.kicker")}</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            {t("plans.title")}
          </h1>
          <p className="admin-page-sub">
            {t("plans.subtitle")}
          </p>
        </div>
        {isOwner ? (
          <Link href="/plans/new" className="admin-btn admin-btn-primary">
            <Plus size={16} strokeWidth={1.75} />
            <span>{t("plans.newPlan")}</span>
          </Link>
        ) : null}
      </header>

      <div className="admin-filter-row">
        <label className="admin-checkbox-row">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>{t("plans.includeInactive")}</span>
        </label>
      </div>

      {query.isPending ? (
        <div className="admin-skeleton-block" aria-busy="true">
          {t("plans.loading")}
        </div>
      ) : query.isError ? (
        <div className="admin-error-block">
          {t("plans.errorLoad")}{" "}
          <button type="button" className="admin-link" onClick={() => void query.refetch()}>
            {t("plans.retry")}
          </button>
        </div>
      ) : query.data.length === 0 ? (
        <EmptyPlans isOwner={isOwner} />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 44 }} aria-label={t("plans.table.icon")} />
              <th>{t("plans.table.code")}</th>
              <th>{t("plans.table.name")}</th>
              <th className="right">{t("plans.table.pricePerMonth")}</th>
              <th>{t("plans.table.limits")}</th>
              <th>{t("plans.table.tenants")}</th>
              <th>{t("plans.table.status")}</th>
              <th style={{ width: 140 }} />
            </tr>
          </thead>
          <tbody>
            {query.data.map((p) => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                <td>
                  <span className="admin-tenant-avatar" aria-hidden="true">
                    <Package size={16} strokeWidth={1.5} />
                  </span>
                </td>
                <td>
                  <Link
                    href={`/plans/${p.id}`}
                    style={{ textDecoration: "none", color: "inherit", fontFamily: "var(--font-mono, monospace)" }}
                  >
                    {p.code}
                  </Link>
                </td>
                <td>{p.name_i18n.en || <span className="admin-muted">—</span>}</td>
                <td className="right">{formatCents(p.monthly_price_cents, p.currency_code)}</td>
                <td>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}>
                    {formatLimit(p.limits.txns)} · {formatLimit(p.limits.users)} ·{" "}
                    {formatLimit(p.limits.branches)} · {formatLimit(p.limits.storage_gb)}
                  </span>
                </td>
                <td>{p.tenant_count}</td>
                <td>
                  <span className={p.is_active ? "admin-chip-active" : "admin-chip-inactive"}>
                    {p.is_active ? t("plans.table.active") : t("plans.table.inactive")}
                  </span>
                </td>
                <td>
                  {isOwner ? (
                    <button
                      type="button"
                      className="admin-link"
                      disabled={toggleActive.isPending}
                      onClick={() => toggleActive.mutate({ id: p.id, active: !p.is_active })}
                    >
                      {p.is_active ? t("plans.table.deactivate") : t("plans.table.activate")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function EmptyPlans({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="admin-empty-block">
      <Package size={32} strokeWidth={1.25} />
      <h2>{t("plans.empty.title")}</h2>
      <p>
        {t("plans.empty.body")}
      </p>
      {isOwner ? (
        <Link href="/plans/new" className="admin-btn admin-btn-primary">
          {t("plans.empty.createFirst")}
        </Link>
      ) : (
        <p className="admin-muted">{t("plans.empty.ownerOnly")}</p>
      )}
    </div>
  );
}
