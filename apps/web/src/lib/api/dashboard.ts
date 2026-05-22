"use client";
import { apiFetch } from "./client";

// Mirrors the server-side `ApiOwnerDashboard` shape returned by
// `GET /v1/dashboard` (apps/api/src/tenant/dashboard/dashboard.controller.ts).
// Keep these interfaces in sync with the controller's DTO — they are the
// typed contract for every consumer in the tenant web app.

export interface ApiOwnerDashboardWeek {
  revenue_cents: string;
  transactions: number;
  items_sold: number;
  gross_profit_cents: string;
  avg_basket_cents: string;
}

export interface ApiOwnerDashboardPrevWeek {
  revenue_cents: string;
  transactions: number;
  gross_profit_cents: string;
}

export interface ApiOwnerDashboardVsPrevWeek {
  revenue_pct: number | null;
  transactions_pct: number | null;
  gross_profit_pct: number | null;
}

export interface ApiOwnerDashboardRevenuePoint {
  date: string;
  cents: number;
}

export interface ApiOwnerDashboardSparklines {
  revenue_cents: number[];
  transactions: number[];
  gross_profit_cents: number[];
}

export interface ApiOwnerDashboardLeaderboardRow {
  branch_id: string;
  code: string;
  name_i18n: { en: string; ar: string } | null;
  revenue_cents: string;
  transactions: number;
  vs_prev_week_pct: number | null;
}

export interface ApiOwnerDashboardRecentTx {
  id: string;
  code: string;
  branch_id: string;
  branch_code: string;
  cashier_id: string | null;
  cashier_name: string | null;
  items: number;
  total_cents: string;
  payment_method: string;
  payment_status: "paid" | "payment_pending" | "disputed" | "refunded";
  occurred_at: string;
}

export type ApiOwnerDashboardInsightKind =
  | "branch_decline"
  | "concentration"
  | "stale_payment_proof"
  | "low_stock_critical"
  | "growth_winner"
  | "week_recap";

export type ApiOwnerDashboardInsightUrgency = "high" | "medium" | "low";

export interface ApiOwnerDashboardInsightAction {
  label_i18n: { en: string; ar: string };
  href: string;
}

export interface ApiOwnerDashboardInsight {
  id: string;
  kind: ApiOwnerDashboardInsightKind;
  urgency: ApiOwnerDashboardInsightUrgency;
  headline_i18n: { en: string; ar: string };
  body_i18n: { en: string; ar: string };
  confidence: number;
  actions: ApiOwnerDashboardInsightAction[];
}

export interface ApiOwnerDashboard {
  currency_code: string;
  mixed_currency_warning: boolean;
  generated_at: string;

  week: ApiOwnerDashboardWeek;
  prev_week: ApiOwnerDashboardPrevWeek;
  vs_prev_week: ApiOwnerDashboardVsPrevWeek;

  revenue_30d: ApiOwnerDashboardRevenuePoint[];
  sparklines: ApiOwnerDashboardSparklines;
  leaderboard: ApiOwnerDashboardLeaderboardRow[];
  heatmap: number[][];
  recent_transactions: ApiOwnerDashboardRecentTx[];
  insights: ApiOwnerDashboardInsight[];
}

export function ownerDashboardRequest(): Promise<ApiOwnerDashboard> {
  return apiFetch<ApiOwnerDashboard>(`/v1/dashboard`);
}
