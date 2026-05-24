"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuthStore } from "@/lib/auth/store";
import {
  adminFetchActivity,
  adminFetchKpi,
  adminFetchTrends,
  type ActivityItem,
} from "@/lib/api/admin-dashboard";
import { KpiCard } from "./_components/KpiCard";
import { DashboardSkeleton } from "./_components/DashboardSkeleton";
import { TenantGrowthChart } from "./_components/TenantGrowthChart";
import { MrrTrendChart } from "./_components/MrrTrendChart";

const ACTIVITY_DOT_COLOR: Record<ActivityItem["kind"], string> = {
  tenant_signup: "var(--accent)",
  sale_completed: "var(--sage)",
  verification_pending: "var(--amber)",
};

function formatCents(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(major);
}

function relativeTime(iso: string): string {
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

function formatDelta(n: number): { label: string; tone: "up" | "down" | "flat" } {
  if (n > 0) return { label: `+${n}`, tone: "up" };
  if (n < 0) return { label: `${n}`, tone: "down" };
  return { label: "—", tone: "flat" };
}

export function DashboardClient() {
  const user = useAdminAuthStore((s) => s.user);

  const kpiQ = useQuery({
    queryKey: ["admin", "dashboard", "kpi"],
    queryFn: adminFetchKpi,
    staleTime: 60_000,
  });
  const trendsQ = useQuery({
    queryKey: ["admin", "dashboard", "trends"],
    queryFn: adminFetchTrends,
    staleTime: 300_000,
  });
  const activityQ = useQuery({
    queryKey: ["admin", "dashboard", "activity"],
    queryFn: () => adminFetchActivity(50),
    staleTime: 30_000,
  });

  if (kpiQ.isPending || activityQ.isPending) return <DashboardSkeleton />;

  if (kpiQ.isError || activityQ.isError) {
    return (
      <div className="admin-error" role="alert">
        <p className="admin-error-title">Couldn&apos;t load dashboard</p>
        <p className="admin-error-body" style={{ marginBottom: 14 }}>
          The platform API didn&apos;t respond. Try again — if it persists, check the API service.
        </p>
        <button
          type="button"
          className="admin-tb-action"
          onClick={() => {
            void kpiQ.refetch();
            void activityQ.refetch();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const kpi = kpiQ.data;
  const activity = activityQ.data;
  const greeting = `Welcome, ${user?.name?.split(" ")[0] ?? "admin"}.`;
  const activeDelta = formatDelta(kpi.active_tenants.delta_7d);

  return (
    <>
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{greeting}</h1>
          <p className="admin-page-sub">
            {kpi.pending_verifications.count > 0
              ? `${kpi.pending_verifications.count} payment proof${kpi.pending_verifications.count === 1 ? "" : "s"} awaiting verification.`
              : "No pending verifications."}
          </p>
        </div>
      </header>

      <div className="admin-kpi-grid">
        <KpiCard
          kicker="Monthly recurring"
          value={formatCents(kpi.monthly_recurring.amount_cents, kpi.monthly_recurring.currency_code)}
          note="across paying tenants"
        />
        <KpiCard
          kicker="Active tenants"
          value={kpi.active_tenants.count}
          delta={activeDelta.label}
          deltaTone={activeDelta.tone}
          note="active + trialing · last 7 days"
        />
        <KpiCard
          kicker="Trials ending soon"
          value={kpi.trials_ending_soon.count}
          note={`within ${kpi.trials_ending_soon.window_days} days`}
        />
        <KpiCard
          kicker="Pending verifications"
          value={kpi.pending_verifications.count}
          note={
            kpi.pending_verifications.oldest_days != null
              ? `oldest · ${kpi.pending_verifications.oldest_days} d`
              : "queue clear"
          }
        />
        <KpiCard
          kicker="System"
          value={kpi.system_health.status === "healthy" ? "Healthy" : kpi.system_health.status}
          note={`${kpi.system_health.uptime_30d_pct.toFixed(2)}% · 30d`}
        />
      </div>

      {trendsQ.data && (
        <div className="admin-chart-grid">
          <TenantGrowthChart data={trendsQ.data.tenant_growth} />
          <MrrTrendChart data={trendsQ.data.mrr_trend} />
        </div>
      )}

      <div className="admin-activity-grid">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <span className="admin-panel-title">Verification queue</span>
            <a href="/verification" className="admin-tb-action" style={{ textDecoration: "none" }}>
              Open queue →
            </a>
          </div>
          {kpi.pending_verifications.count === 0 ? (
            <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-3)" }}>
              No payment proofs are awaiting verification. When tenants submit bank-transfer
              receipts, they&apos;ll appear here.
            </p>
          ) : (
            <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-2)" }}>
              {kpi.pending_verifications.count} proof
              {kpi.pending_verifications.count === 1 ? "" : "s"} pending · oldest{" "}
              {kpi.pending_verifications.oldest_days ?? 0} days.
            </p>
          )}
        </div>
        <div className="admin-panel">
          <div className="admin-panel-head">
            <span className="admin-panel-title">Recent activity</span>
          </div>
          {activity.items.length === 0 ? (
            <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-3)" }}>
              No activity yet.
            </p>
          ) : (
            <div>
              {activity.items.slice(0, 15).map((item, i) => (
                <div className="admin-activity-row" key={`${item.kind}-${item.tenant_id}-${i}`}>
                  <span
                    className="admin-activity-dot"
                    style={{ background: ACTIVITY_DOT_COLOR[item.kind] }}
                  />
                  <span className="admin-activity-text">{item.text}</span>
                  <span className="admin-activity-time">{relativeTime(item.occurred_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
