import { createHash } from "node:crypto";
import { INSIGHT_COPY, interpolate } from "./dashboard.insights.i18n";

/**
 * Pure rule engine for the owner dashboard insight rail.
 *
 * Six deterministic rules — no LLM, no randomness, no DB access. The caller
 * collects metrics once and hands them in; this function turns them into the
 * insight list the API ships to the client. Each insight carries a stable
 * SHA-256-derived `id` so the client can persist dismiss state across reloads
 * without the server needing to know which ones were dismissed.
 *
 * Evaluation order is fixed; the top 4 by urgency rank ship to the client.
 * Urgency order is `high > medium > low`; ties keep insertion order, which
 * lets the rule list itself imply the secondary sort (branch_decline beats
 * stale_payment_proof on a tie, etc.).
 */

export type InsightKind =
  | "branch_decline"
  | "concentration"
  | "stale_payment_proof"
  | "low_stock_critical"
  | "growth_winner"
  | "week_recap";

export type InsightUrgency = "high" | "medium" | "low";

export interface InsightAction {
  label_i18n: { en: string; ar: string };
  href: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  urgency: InsightUrgency;
  headline_i18n: { en: string; ar: string };
  body_i18n: { en: string; ar: string };
  confidence: number;
  actions: InsightAction[];
}

export interface InsightLeaderboardRow {
  branch_id: string;
  code: string;
  name_i18n: { en: string; ar: string } | null;
  revenue_cents: string;
  transactions: number;
  vs_prev_week_pct: number | null;
}

export interface InsightContext {
  tenantId: string;
  weekStart: Date;
  leaderboard: InsightLeaderboardRow[];
  topProduct: {
    product_id: string;
    name_i18n: { en: string; ar: string };
    revenue_cents: string;
  } | null;
  weekRevenueCents: string;
  weekTransactions: number;
  stalePaymentProofsCount: number;
  lowStockCount: number;
  currencyCode: string;
  /** Reserved for future per-locale rendering. Not used today — both EN+AR ship. */
  locale?: "en" | "ar";
}

const URGENCY_RANK: Record<InsightUrgency, number> = { high: 3, medium: 2, low: 1 };

const ACTION_LABELS = {
  view_branch: { en: "View branch", ar: "عرض الفرع" },
  open_inventory: { en: "Open inventory", ar: "فتح المخزون" },
  open_verification_queue: { en: "Open verification queue", ar: "فتح قائمة التحقق" },
  plan_reorder: { en: "Plan reorder", ar: "خطّط لإعادة الطلب" },
  view_product: { en: "View product", ar: "عرض المنتج" },
} as const;

export function computeInsights(ctx: InsightContext): Insight[] {
  const all: Insight[] = [];
  const weekKey = ctx.weekStart.toISOString().slice(0, 10);

  // 1. branch_decline — any branch with ≤ -10% week-over-week, max 2.
  const decliningBranches = ctx.leaderboard
    .filter((b) => b.vs_prev_week_pct !== null && b.vs_prev_week_pct <= -10)
    .sort((a, b) => (a.vs_prev_week_pct ?? 0) - (b.vs_prev_week_pct ?? 0))
    .slice(0, 2);

  for (const branch of decliningBranches) {
    const pctAbs = Math.abs(branch.vs_prev_week_pct ?? 0).toFixed(0);
    const enName = branch.name_i18n?.en || branch.code;
    const arName = branch.name_i18n?.ar || branch.code;
    all.push({
      id: makeInsightId(ctx.tenantId, "branch_decline", branch.branch_id, weekKey),
      kind: "branch_decline",
      urgency: "high",
      headline_i18n: {
        en: interpolate(INSIGHT_COPY.branch_decline.en.headline, { branch: enName, pct: pctAbs }),
        ar: interpolate(INSIGHT_COPY.branch_decline.ar.headline, { branch: arName, pct: pctAbs }),
      },
      body_i18n: {
        en: interpolate(INSIGHT_COPY.branch_decline.en.body, { branch: enName, pct: pctAbs }),
        ar: interpolate(INSIGHT_COPY.branch_decline.ar.body, { branch: arName, pct: pctAbs }),
      },
      confidence: 0.9,
      actions: [
        {
          label_i18n: ACTION_LABELS.view_branch,
          href: `/branches/${branch.branch_id}/dashboard`,
        },
      ],
    });
  }

  // 2. concentration — single product is ≥ 30% of week revenue.
  if (ctx.topProduct) {
    const weekRevenue = Number(ctx.weekRevenueCents);
    const productRevenue = Number(ctx.topProduct.revenue_cents);
    if (weekRevenue > 0 && productRevenue / weekRevenue >= 0.3) {
      const pctAbs = Math.round((productRevenue / weekRevenue) * 100).toFixed(0);
      const enName = ctx.topProduct.name_i18n.en;
      const arName = ctx.topProduct.name_i18n.ar;
      all.push({
        id: makeInsightId(ctx.tenantId, "concentration", ctx.topProduct.product_id, weekKey),
        kind: "concentration",
        urgency: "medium",
        headline_i18n: {
          en: interpolate(INSIGHT_COPY.concentration.en.headline, { product: enName, pct: pctAbs }),
          ar: interpolate(INSIGHT_COPY.concentration.ar.headline, { product: arName, pct: pctAbs }),
        },
        body_i18n: {
          en: interpolate(INSIGHT_COPY.concentration.en.body, { product: enName, pct: pctAbs }),
          ar: interpolate(INSIGHT_COPY.concentration.ar.body, { product: arName, pct: pctAbs }),
        },
        confidence: 0.75,
        actions: [
          {
            label_i18n: ACTION_LABELS.view_product,
            href: `/inventory/products/${ctx.topProduct.product_id}`,
          },
        ],
      });
    }
  }

  // 3. stale_payment_proof — at least one pending proof older than 48 h.
  if (ctx.stalePaymentProofsCount > 0) {
    const noun_en = ctx.stalePaymentProofsCount === 1 ? "proof" : "proofs";
    const noun_ar = ctx.stalePaymentProofsCount === 1 ? "إثبات" : "إثباتات";
    all.push({
      id: makeInsightId(ctx.tenantId, "stale_payment_proof", "global", weekKey),
      kind: "stale_payment_proof",
      urgency: "high",
      headline_i18n: {
        en: interpolate(INSIGHT_COPY.stale_payment_proof.en.headline, {
          count: ctx.stalePaymentProofsCount,
          noun: noun_en,
        }),
        ar: interpolate(INSIGHT_COPY.stale_payment_proof.ar.headline, {
          count: ctx.stalePaymentProofsCount,
          noun: noun_ar,
        }),
      },
      body_i18n: {
        en: INSIGHT_COPY.stale_payment_proof.en.body,
        ar: INSIGHT_COPY.stale_payment_proof.ar.body,
      },
      confidence: 1,
      actions: [
        {
          label_i18n: ACTION_LABELS.open_verification_queue,
          href: `/sales/verification`,
        },
      ],
    });
  }

  // 4. low_stock_critical — at least one product at zero on hand somewhere.
  if (ctx.lowStockCount > 0) {
    const noun_en = ctx.lowStockCount === 1 ? "product" : "products";
    const noun_ar = ctx.lowStockCount === 1 ? "منتج" : "منتجات";
    all.push({
      id: makeInsightId(ctx.tenantId, "low_stock_critical", "global", weekKey),
      kind: "low_stock_critical",
      urgency: "medium",
      headline_i18n: {
        en: interpolate(INSIGHT_COPY.low_stock_critical.en.headline, {
          count: ctx.lowStockCount,
          noun: noun_en,
        }),
        ar: interpolate(INSIGHT_COPY.low_stock_critical.ar.headline, {
          count: ctx.lowStockCount,
          noun: noun_ar,
        }),
      },
      body_i18n: {
        en: INSIGHT_COPY.low_stock_critical.en.body,
        ar: INSIGHT_COPY.low_stock_critical.ar.body,
      },
      confidence: 1,
      actions: [
        {
          label_i18n: ACTION_LABELS.plan_reorder,
          href: `/inventory`,
        },
      ],
    });
  }

  // 5. growth_winner — best branch at ≥ +20%, one only.
  const winner = ctx.leaderboard
    .filter((b) => b.vs_prev_week_pct !== null && b.vs_prev_week_pct >= 20)
    .sort((a, b) => (b.vs_prev_week_pct ?? 0) - (a.vs_prev_week_pct ?? 0))[0];
  if (winner) {
    const pctAbs = Math.abs(winner.vs_prev_week_pct ?? 0).toFixed(0);
    const enName = winner.name_i18n?.en || winner.code;
    const arName = winner.name_i18n?.ar || winner.code;
    all.push({
      id: makeInsightId(ctx.tenantId, "growth_winner", winner.branch_id, weekKey),
      kind: "growth_winner",
      urgency: "low",
      headline_i18n: {
        en: interpolate(INSIGHT_COPY.growth_winner.en.headline, { branch: enName, pct: pctAbs }),
        ar: interpolate(INSIGHT_COPY.growth_winner.ar.headline, { branch: arName, pct: pctAbs }),
      },
      body_i18n: {
        en: interpolate(INSIGHT_COPY.growth_winner.en.body, { branch: enName, pct: pctAbs }),
        ar: interpolate(INSIGHT_COPY.growth_winner.ar.body, { branch: arName, pct: pctAbs }),
      },
      confidence: 0.85,
      actions: [
        {
          label_i18n: ACTION_LABELS.view_branch,
          href: `/branches/${winner.branch_id}/dashboard`,
        },
      ],
    });
  }

  // Pick top 4 by urgency (stable sort by insertion order on ties).
  const indexed = all.map((insight, idx) => ({ insight, idx }));
  indexed.sort((a, b) => {
    const diff = URGENCY_RANK[b.insight.urgency] - URGENCY_RANK[a.insight.urgency];
    if (diff !== 0) return diff;
    return a.idx - b.idx;
  });
  const top = indexed.slice(0, 4).map((x) => x.insight);

  // 6. week_recap — fallback so the rail never ships empty.
  if (top.length < 4) {
    const revenueDisplay = formatRevenueDisplay(ctx.weekRevenueCents, ctx.currencyCode);
    top.push({
      id: makeInsightId(ctx.tenantId, "week_recap", "global", weekKey),
      kind: "week_recap",
      urgency: "low",
      headline_i18n: {
        en: interpolate(INSIGHT_COPY.week_recap.en.headline, {
          revenue: revenueDisplay,
          transactions: ctx.weekTransactions,
        }),
        ar: interpolate(INSIGHT_COPY.week_recap.ar.headline, {
          revenue: revenueDisplay,
          transactions: ctx.weekTransactions,
        }),
      },
      body_i18n: {
        en: INSIGHT_COPY.week_recap.en.body,
        ar: INSIGHT_COPY.week_recap.ar.body,
      },
      confidence: 1,
      actions: [],
    });
  }

  return top;
}

function makeInsightId(
  tenantId: string,
  kind: InsightKind,
  primaryEntity: string,
  weekKey: string,
): string {
  return createHash("sha256")
    .update(`${tenantId}:${kind}:${primaryEntity}:${weekKey}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Locale-agnostic minor-units → major-units string for headline copy. Keeps
 * the rule engine free of `Intl.NumberFormat` overhead; the client can re-
 * format if it wants a more polished presentation. Treats every currency as
 * 2 minor units except the small set with 0 or 3 — close enough for headline
 * copy where exactness is not the point.
 */
function formatRevenueDisplay(revenueCents: string, currencyCode: string): string {
  const minorUnits = getMinorUnits(currencyCode);
  const amount = Number(revenueCents);
  if (!Number.isFinite(amount)) return `${revenueCents} ${currencyCode}`;
  const major = amount / Math.pow(10, minorUnits);
  return `${major.toLocaleString("en-US", {
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  })} ${currencyCode}`;
}

function getMinorUnits(currencyCode: string): number {
  switch (currencyCode.toUpperCase()) {
    case "JPY":
    case "KRW":
    case "VND":
      return 0;
    case "KWD":
    case "BHD":
    case "OMR":
      return 3;
    default:
      return 2;
  }
}
