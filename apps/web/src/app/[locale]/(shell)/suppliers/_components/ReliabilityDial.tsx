"use client";

/**
 * Hand-rolled SVG circular progress.
 * - pct in 0–100, or null when no data.
 * - Color tiers: ≥90 sage, 80–89 accent, <80 rose, null muted ink-3.
 * - Center text shows the integer pct (no `%` — the ring conveys the unit).
 */
export function ReliabilityDial({
  pct,
  size = 56,
  strokeWidth = 3,
}: {
  pct: number | null;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const dash = (value / 100) * circumference;
  const color =
    pct === null
      ? "var(--ink-3)"
      : pct >= 90
        ? "var(--sage)"
        : pct >= 80
          ? "var(--accent)"
          : "var(--rose)";

  const fontSize = Math.round(size * 0.28);

  return (
    <div className="sup-dial" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={strokeWidth}
        />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="sup-dial-text" style={{ fontSize }}>
        {pct === null ? "—" : Math.round(pct)}
      </div>
    </div>
  );
}
