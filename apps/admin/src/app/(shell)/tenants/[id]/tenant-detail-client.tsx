"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogIn, ShieldAlert } from "lucide-react";
import { adminGetTenant, type TenantDetail } from "@/lib/api/admin-tenant-detail";
import { StatusChip } from "../../_components/StatusChip";
import { LoginAsModal } from "./_components/LoginAsModal";

function formatCents(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(major);
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const INVOICE_STATUS_TONE: Record<string, string> = {
  paid: "var(--sage)",
  awaiting_payment: "var(--amber)",
  in_review: "var(--accent)",
  overdue: "var(--rose)",
  draft: "var(--ink-3)",
  cancelled: "var(--ink-3)",
};

export function TenantDetailClient({ tenantId }: { tenantId: string }) {
  const [loginAsOpen, setLoginAsOpen] = useState(false);

  const query = useQuery<TenantDetail>({
    queryKey: ["admin", "tenant", tenantId],
    queryFn: () => adminGetTenant(tenantId),
    staleTime: 15_000,
  });

  if (query.isPending) {
    return (
      <div style={{ padding: 40, color: "var(--ink-3)" }}>Loading tenant…</div>
    );
  }
  if (query.isError) {
    return (
      <div style={{ padding: 40, color: "var(--rose)" }}>
        Could not load this tenant.
      </div>
    );
  }

  const t = query.data;

  return (
    <>
      <Link
        href="/tenants"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--ink-3)",
          fontSize: 13,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        All tenants
      </Link>

      <header className="admin-page-header" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 20, flex: 1 }}>
          <div
            aria-hidden
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background:
                "linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent) 60%, #1A1714))",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <span className="admin-kpi-kicker">
              {t.plan.name} plan · {t.country_code}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              <h1 className="admin-page-title">{t.name}</h1>
              <StatusChip status={t.status} />
            </div>
            <p className="admin-page-sub" style={{ marginTop: 6 }}>
              Joined {shortDate(t.created_at)} · Slug{" "}
              <code style={{ fontFamily: "var(--mono)", color: "var(--ink-2)" }}>
                {t.slug}
              </code>
              {t.kpis.last_activity_at && (
                <> · Last activity {shortDate(t.kpis.last_activity_at)}</>
              )}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setLoginAsOpen(true)}
            className="admin-btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <LogIn size={14} strokeWidth={1.5} />
            Log in as
          </button>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBlock: 24,
        }}
      >
        <KpiBlock
          label="Last 30d revenue"
          value={formatCents(t.kpis.last_30d_revenue_cents, t.default_currency_code)}
        />
        <KpiBlock label="Last 30d sales" value={String(t.kpis.last_30d_sale_count)} />
        <KpiBlock label="Active branches" value={String(t.kpis.branch_count)} />
        <KpiBlock label="Active users" value={String(t.kpis.user_count)} />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2 className="admin-section-title">Recent invoices</h2>
          {t.recent_invoices.length === 0 && (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No invoices yet.</p>
          )}
          {t.recent_invoices.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Period</th>
                  <th>Due</th>
                  <th style={{ textAlign: "end" }}>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {t.recent_invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                      {inv.reference_code}
                    </td>
                    <td>
                      {inv.period_start} → {inv.period_end}
                    </td>
                    <td>{inv.due_date}</td>
                    <td style={{ textAlign: "end" }}>
                      {formatCents(inv.amount_cents, inv.currency_code)}
                    </td>
                    <td
                      style={{
                        color: INVOICE_STATUS_TONE[inv.status] ?? "var(--ink-3)",
                        textTransform: "capitalize",
                        fontSize: 12,
                      }}
                    >
                      {inv.status.replace("_", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="admin-section-title" style={{ marginTop: 32 }}>
            Branches ({t.branches.length})
          </h2>
          {t.branches.length === 0 && (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No branches yet.</p>
          )}
          {t.branches.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Currency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {t.branches.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{b.code}</td>
                    <td>{b.name_i18n.en}</td>
                    <td>{b.currency_code}</td>
                    <td style={{ color: b.is_active ? "var(--sage)" : "var(--ink-3)" }}>
                      {b.is_active ? "Active" : "Inactive"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside>
          <h2 className="admin-section-title">Users ({t.users.length})</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {t.users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--rule)",
                  borderRadius: 10,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {u.email}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: u.role === "owner" ? "var(--accent-soft)" : "var(--bg-sunk)",
                    color: u.role === "owner" ? "var(--accent)" : "var(--ink-3)",
                  }}
                >
                  {u.role}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              background: "var(--amber-soft)",
              border: "1px solid color-mix(in oklab, var(--amber) 25%, transparent)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--ink-2)",
              display: "flex",
              gap: 10,
            }}
          >
            <ShieldAlert
              size={16}
              strokeWidth={1.5}
              style={{ color: "var(--amber)", flexShrink: 0 }}
            />
            <span>
              Logging in as a tenant user is double-logged to both the platform audit
              and tenant audit. Destructive operations (deletes, bulk ops) are blocked
              during impersonation.
            </span>
          </div>
        </aside>
      </section>

      {loginAsOpen && (
        <LoginAsModal
          tenant={t}
          onClose={() => setLoginAsOpen(false)}
        />
      )}
    </>
  );
}

function KpiBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <span className="admin-kpi-kicker">{label}</span>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 28,
          letterSpacing: "-0.02em",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
