"use client";

import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { t } from "@/lib/i18n";

interface Props {
  data: Array<{ date: string; amount_cents: string; currency_code: string }>;
}

function formatCents(cents: string, currency: string): string {
  const major = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(major);
}

export function MrrTrendChart({ data }: Props) {
  const currency = data[0]?.currency_code ?? "USD";
  const firstCents = data[0]?.amount_cents ?? "0";
  const lastCents = data[data.length - 1]?.amount_cents ?? "0";
  const delta = Number(BigInt(lastCents) - BigInt(firstCents)) / 100;
  const deltaStr =
    delta >= 0
      ? `+${formatCents(String(Math.abs(delta) * 100), currency)}`
      : `-${formatCents(String(Math.abs(delta) * 100), currency)}`;

  const chartData = data.map((d) => ({
    ...d,
    amount: Number(BigInt(d.amount_cents)) / 100,
  }));

  return (
    <div className="admin-panel" style={{ padding: 22 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <span className="admin-kicker">{t("dashboard.charts.mrrTrend")}</span>
        <span style={{ fontSize: 11, fontFamily: "var(--sans)", color: "var(--sage)" }}>
          {deltaStr}
        </span>
      </header>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A6B7A" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#4A6B7A" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="5 5" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fontFamily: "var(--sans)", fill: "var(--ink-3)" }}
            tickFormatter={(v: string) => v.slice(5)}
            interval={14}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: "var(--sans)", fill: "var(--ink-3)" }}
            width={48}
            tickFormatter={(v: number) =>
              formatCents(String(Math.round(v * 100)), currency).replace(/\.00$/, "")
            }
          />
          <Tooltip
            contentStyle={{
              fontFamily: "var(--sans)",
              fontSize: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
            formatter={(v) => [
              formatCents(String(Math.round(Number(v ?? 0) * 100)), currency),
              t("dashboard.charts.mrrLabel"),
            ]}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#4A6B7A"
            strokeWidth={2}
            fill="url(#mrrGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
