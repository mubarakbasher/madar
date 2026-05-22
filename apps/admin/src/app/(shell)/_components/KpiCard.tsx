import type { ReactNode } from "react";

export function KpiCard({
  kicker,
  value,
  delta,
  deltaTone,
  note,
}: {
  kicker: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  note?: string;
}) {
  return (
    <div className="admin-kpi-card">
      <span className="admin-kpi-kicker">{kicker}</span>
      <div className="admin-kpi-value">{value}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        {delta && (
          <span
            className={`admin-kpi-delta admin-kpi-delta--${deltaTone ?? "flat"}`}
          >
            {delta}
          </span>
        )}
        {note && <span className="admin-kpi-note">{note}</span>}
      </div>
    </div>
  );
}
