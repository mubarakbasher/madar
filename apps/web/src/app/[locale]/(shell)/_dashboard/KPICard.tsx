import { ArrowUp, ArrowDown } from "lucide-react";
import { Sparkline } from "./Sparkline";

export function KPICard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: number | null;
  deltaLabel: string;
  spark?: number[];
}) {
  const hasDelta = delta !== null && Number.isFinite(delta);
  const up = hasDelta && (delta as number) >= 0;
  return (
    <div className="dash-kpi">
      <div className="kicker">{label}</div>
      <div className="dash-kpi-value">
        {unit && <span className="dash-kpi-unit">{unit}</span>}
        {value}
      </div>
      <div className="dash-kpi-foot">
        {hasDelta ? (
          <span className={`delta ${up ? "up" : "dn"}`}>
            {up ? (
              <ArrowUp size={11} strokeWidth={1.75} />
            ) : (
              <ArrowDown size={11} strokeWidth={1.75} />
            )}
            {Math.abs(delta as number).toFixed(1)}%
            <span className="delta-sub">{deltaLabel}</span>
          </span>
        ) : (
          <span className="delta" style={{ color: "var(--ink-3)" }}>
            —<span className="delta-sub">{deltaLabel}</span>
          </span>
        )}
        {spark && spark.length >= 2 && <Sparkline data={spark} />}
      </div>
    </div>
  );
}
