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
          <span className="admin-kpi-kicker">Pricing · plans</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            Plans
          </h1>
          <p className="admin-page-sub">
            Subscription tiers offered to tenants. Tenant signup currently uses code <code>starter</code>;
            create at least one plan with that code before opening signups.
          </p>
        </div>
        {isOwner ? (
          <Link href="/plans/new" className="admin-btn admin-btn-primary">
            <Plus size={16} strokeWidth={1.75} />
            <span>New plan</span>
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
          <span>Include inactive plans</span>
        </label>
      </div>

      {query.isPending ? (
        <div className="admin-skeleton-block" aria-busy="true">
          Loading plans…
        </div>
      ) : query.isError ? (
        <div className="admin-error-block">
          Couldn’t load plans.{" "}
          <button type="button" className="admin-link" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : query.data.length === 0 ? (
        <EmptyPlans isOwner={isOwner} />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 44 }} aria-label="Icon" />
              <th>Code</th>
              <th>Name</th>
              <th className="right">Price / mo</th>
              <th>Limits (txn · user · branch · GB)</th>
              <th>Tenants</th>
              <th>Status</th>
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
                    {p.is_active ? "Active" : "Inactive"}
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
                      {p.is_active ? "Deactivate" : "Activate"}
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
      <h2>No plans yet</h2>
      <p>
        Plans define the subscription tiers tenants pay for. Tenant signup needs at least one plan
        with code <code>starter</code> before it will succeed.
      </p>
      {isOwner ? (
        <Link href="/plans/new" className="admin-btn admin-btn-primary">
          Create the first plan
        </Link>
      ) : (
        <p className="admin-muted">Ask the Platform Owner to create plans.</p>
      )}
    </div>
  );
}
