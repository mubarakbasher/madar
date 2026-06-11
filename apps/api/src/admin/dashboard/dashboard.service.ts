import { Injectable } from "@nestjs/common";
import { adminPrisma } from "@madar/db";
import { formatMoney } from "../../common/currency";

export interface KpiResponse {
  monthly_recurring: { amount_cents: string; currency_code: string; delta_pct_30d: number | null };
  active_tenants: { count: number; delta_7d: number };
  trials_ending_soon: { count: number; window_days: number };
  pending_verifications: { count: number; oldest_days: number | null };
  system_health: {
    status: "healthy" | "degraded" | "incident";
    uptime_30d_pct: number;
    last_incident_at: string | null;
  };
}

export interface ActivityItem {
  kind: "tenant_signup" | "sale_completed" | "verification_pending";
  occurred_at: string;
  tenant_id: string;
  tenant_name: string;
  text: string;
}

export interface ActivityResponse {
  items: ActivityItem[];
}

export interface TrendsResponse {
  tenant_growth: Array<{ date: string; count: number }>;
  mrr_trend: Array<{ date: string; amount_cents: string; currency_code: string }>;
}

const TRIALS_WINDOW_DAYS = 7;
const ACTIVE_STATUSES = ["active", "trialing"] as const;
const MRR_STATUSES = ["active", "trialing", "grace_period"] as const;

@Injectable()
export class DashboardService {
  async computeKpi(): Promise<KpiResponse> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000);

    const [mrrTenants, activeCount, oldActiveCount, trialsEndingCount, proofAgg] =
      await Promise.all([
        adminPrisma.tenant.findMany({
          where: { status: { in: [...MRR_STATUSES] } },
          select: {
            default_currency_code: true,
            plan: { select: { monthly_price_cents: true } },
          },
        }),
        adminPrisma.tenant.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),
        adminPrisma.tenant.count({
          where: { status: { in: [...ACTIVE_STATUSES] }, created_at: { lt: sevenDaysAgo } },
        }),
        adminPrisma.tenant.count({
          where: {
            status: "trialing",
            trial_ends_at: { gte: now, lt: sevenDaysFromNow },
          },
        }),
        adminPrisma.paymentProof.aggregate({
          where: { status: "pending" },
          _count: { _all: true },
          _min: { created_at: true },
        }),
      ]);

    let mrrCents = 0n;
    const currencyCounts = new Map<string, number>();
    for (const t of mrrTenants) {
      // Tenants without a plan contribute 0 to MRR and aren't counted in
      // the dominant-currency tally either (no commercial signal yet).
      if (!t.plan) continue;
      mrrCents += t.plan.monthly_price_cents;
      currencyCounts.set(
        t.default_currency_code,
        (currencyCounts.get(t.default_currency_code) ?? 0) + 1,
      );
    }
    const dominantCurrency =
      [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

    const pendingCount = proofAgg._count._all;
    const oldestPending = proofAgg._min.created_at;
    const oldestDays = oldestPending
      ? Math.max(0, Math.round((now.getTime() - oldestPending.getTime()) / 86_400_000))
      : null;

    return {
      monthly_recurring: {
        amount_cents: mrrCents.toString(),
        currency_code: dominantCurrency,
        delta_pct_30d: null,
      },
      active_tenants: {
        count: activeCount,
        delta_7d: activeCount - oldActiveCount,
      },
      trials_ending_soon: { count: trialsEndingCount, window_days: TRIALS_WINDOW_DAYS },
      pending_verifications: { count: pendingCount, oldest_days: oldestDays },
      system_health: {
        status: "healthy",
        uptime_30d_pct: 99.97,
        last_incident_at: null,
      },
    };
  }

  async computeTrends(): Promise<TrendsResponse> {
    // ── Dominant currency (same logic as computeKpi) ──────────────
    const mrrTenants = await adminPrisma.tenant.findMany({
      where: { status: { in: [...MRR_STATUSES] } },
      select: {
        default_currency_code: true,
        plan: { select: { monthly_price_cents: true } },
      },
    });
    const currencyCounts = new Map<string, number>();
    for (const t of mrrTenants) {
      if (!t.plan) continue;
      currencyCounts.set(
        t.default_currency_code,
        (currencyCounts.get(t.default_currency_code) ?? 0) + 1,
      );
    }
    const dominantCurrency =
      [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

    // ── Tenant growth (90 days) ──────────────────────────────────
    const growthRows = await adminPrisma.$queryRaw<
      Array<{ d: Date; count: bigint }>
    >`
      WITH dates AS (
        SELECT generate_series(
          (CURRENT_DATE - INTERVAL '89 days')::date,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS d
      )
      SELECT d, (
        SELECT COUNT(*)::int FROM tenants
        WHERE created_at::date <= d
          AND status NOT IN ('cancelled')
      )::bigint AS count
      FROM dates ORDER BY d
    `;

    const tenantGrowth = growthRows.map((r) => ({
      date: r.d.toISOString().slice(0, 10),
      count: Number(r.count),
    }));

    // ── MRR trend (90 days) ──────────────────────────────────────
    const mrrRows = await adminPrisma.$queryRaw<
      Array<{ d: Date; amount_cents: bigint }>
    >`
      WITH dates AS (
        SELECT generate_series(
          (CURRENT_DATE - INTERVAL '89 days')::date,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS d
      )
      SELECT d, COALESCE(SUM(p.monthly_price_cents), 0)::bigint AS amount_cents
      FROM dates
      LEFT JOIN tenants t ON t.created_at::date <= d
        AND t.status IN ('active', 'trialing', 'grace_period')
      LEFT JOIN plans p ON p.id = t.plan_id
      GROUP BY d ORDER BY d
    `;

    const mrrTrend = mrrRows.map((r) => ({
      date: r.d.toISOString().slice(0, 10),
      amount_cents: r.amount_cents.toString(),
      currency_code: dominantCurrency,
    }));

    return { tenant_growth: tenantGrowth, mrr_trend: mrrTrend };
  }

  async listActivity(limit: number): Promise<ActivityResponse> {
    const capped = Math.min(Math.max(limit, 1), 200);

    const [signups, saleEvents, pendingProofs] = await Promise.all([
      adminPrisma.tenant.findMany({
        orderBy: { created_at: "desc" },
        take: capped,
        select: { id: true, name: true, created_at: true },
      }),
      adminPrisma.auditLog.findMany({
        where: { action: "sale_completed" },
        orderBy: { created_at: "desc" },
        take: capped,
        select: { tenant_id: true, created_at: true, after: true },
      }),
      adminPrisma.paymentProof.findMany({
        where: { status: "pending" },
        orderBy: { created_at: "desc" },
        take: capped,
        select: {
          tenant_id: true,
          created_at: true,
          context: true,
          amount_cents: true,
          currency_code: true,
        },
      }),
    ]);

    // Tenant join for the latter two — fetch all in one round-trip.
    const allTenantIds = new Set<string>([
      ...saleEvents.map((s) => s.tenant_id),
      ...pendingProofs.map((p) => p.tenant_id),
    ]);
    const tenants = allTenantIds.size
      ? await adminPrisma.tenant.findMany({
          where: { id: { in: [...allTenantIds] } },
          select: { id: true, name: true },
        })
      : [];
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    const items: ActivityItem[] = [];

    for (const t of signups) {
      items.push({
        kind: "tenant_signup",
        occurred_at: t.created_at.toISOString(),
        tenant_id: t.id,
        tenant_name: t.name,
        text: `${t.name} signed up`,
      });
    }
    for (const s of saleEvents) {
      const name = tenantMap.get(s.tenant_id);
      // Drop events for tenants that no longer exist — otherwise they'd
      // surface as "Unknown tenant" in the feed.
      if (!name) continue;
      const code = (s.after as { code?: string } | null)?.code ?? "";
      items.push({
        kind: "sale_completed",
        occurred_at: s.created_at.toISOString(),
        tenant_id: s.tenant_id,
        tenant_name: name,
        text: code ? `${name} completed sale ${code}` : `${name} completed a sale`,
      });
    }
    for (const p of pendingProofs) {
      const name = tenantMap.get(p.tenant_id);
      if (!name) continue;
      const amount = formatMoney(p.amount_cents, p.currency_code, "en-US");
      items.push({
        kind: "verification_pending",
        occurred_at: p.created_at.toISOString(),
        tenant_id: p.tenant_id,
        tenant_name: name,
        text: `${name} submitted ${amount} for verification (${p.context})`,
      });
    }

    items.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    return { items: items.slice(0, capped) };
  }
}
