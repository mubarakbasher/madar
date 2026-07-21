"use client";

import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { t } from "@/lib/i18n";

interface Props {
  data: Array<{ date: string; count: number }>;
}

export function TenantGrowthChart({ data }: Props) {
  const first = data[0]?.count ?? 0;
  const last = data[data.length - 1]?.count ?? 0;

  return (
    <div className="admin-panel" style={{ padding: 22 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <span className="admin-kicker">{t("dashboard.charts.tenantGrowth")}</span>
        <span style={{ fontSize: 11, fontFamily: "var(--sans)", color: "var(--ink-3)" }}>
          {first} &rarr; {last} tenants
        </span>
      </header>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="5 5" stroke="var(--rule)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fontFamily: "var(--sans)", fill: "var(--ink-3)" }}
            tickFormatter={(v: string) => v.slice(5)}
            interval={14}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: "var(--sans)", fill: "var(--ink-3)" }}
            width={32}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              fontFamily: "var(--sans)",
              fontSize: 12,
              background: "var(--bg)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--accent)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
