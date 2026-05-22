"use client";

/**
 * Generic SVG line chart, lifted from `_dashboard/RevenueHeroChart.tsx`.
 *
 * Hand-coded SVG (no Recharts) so it matches the calm, editorial look of the
 * Claude-inspired design system: dashed gridlines, single-color primary line,
 * a soft area fill, and tiny peak/trough annotations. All colors come from
 * design tokens (--accent, --rule, --ink-*, --bg-elev).
 *
 * Caller is responsible for the chrome (title, KPIs, axis ticks beyond the
 * built-in start/end labels). This component just renders the plot.
 */

export interface TrendLineChartPoint {
  date: string;
  value: number;
  value_prev?: number | null;
  rolling_avg?: number;
}

export interface TrendLineChartProps {
  series: TrendLineChartPoint[];
  /** SVG plot height in px. Default 240. */
  height?: number;
  /** Optional value formatter for the data-driven annotations. */
  formatValue?: (v: number) => string;
  /** Accessible label for the figure. */
  ariaLabel?: string;
}

export function TrendLineChart({
  series,
  height = 240,
  formatValue,
  ariaLabel,
}: TrendLineChartProps) {
  // Empty state: render an empty plot frame with a quiet message slot. The
  // surrounding page renders an empty-state card before mounting the chart, so
  // we just bail gracefully here.
  if (series.length === 0) {
    return (
      <svg
        viewBox={`0 0 720 ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel ?? "Trend chart"}
        style={{ display: "block" }}
      />
    );
  }

  const main = series.map((p) => p.value);
  const overlay = series.map((p) => p.value_prev);
  const hasOverlay = overlay.some((v) => v !== null && v !== undefined);

  const w = 720;
  const h = height;
  const padX = 32;
  const padY = 32;

  // Normalize against both series so the overlay isn't clipped when prior
  // period was much larger or smaller.
  const allValues = [
    ...main,
    ...(hasOverlay ? overlay.filter((v): v is number => v !== null && v !== undefined) : []),
  ];
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const range = max - min || 1;

  const stepX = series.length > 1 ? (w - padX * 2) / (series.length - 1) : 0;

  const toXY = (v: number, i: number): readonly [number, number] => [
    padX + i * stepX,
    h - padY - ((v - min) / range) * (h - padY * 2),
  ];

  const mainPts = main.map((v, i) => toXY(v, i));
  const mainPath = mainPts
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const firstPt = mainPts[0]!;
  const lastPt = mainPts[mainPts.length - 1]!;
  const areaPath = `${mainPath} L${lastPt[0]},${h - padY} L${firstPt[0]},${h - padY} Z`;

  // Overlay (dashed) — only render if overlay values exist; skip nulls in path.
  let overlayPath = "";
  if (hasOverlay) {
    let started = false;
    overlay.forEach((v, i) => {
      if (v === null || v === undefined) {
        started = false;
        return;
      }
      const [x, y] = toXY(v, i);
      overlayPath += started ? ` L${x},${y}` : `M${x},${y}`;
      started = true;
    });
  }

  // Peak / trough — only over non-zero days to match the API's summary logic.
  const nonZero = mainPts
    .map((pt, i) => ({ pt, i, v: main[i]! }))
    .filter((p) => p.v !== 0);
  const peak = nonZero.length
    ? nonZero.reduce((b, p) => (p.v > b.v ? p : b))
    : null;
  const trough = nonZero.length
    ? nonZero.reduce((b, p) => (p.v < b.v ? p : b))
    : null;

  const fmt = formatValue ?? ((v: number) => String(v));

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      role="img"
      aria-label={ariaLabel ?? "Trend chart"}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={padX}
          x2={w - padX}
          y1={padY + g * (h - padY * 2)}
          y2={padY + g * (h - padY * 2)}
          stroke="var(--rule)"
          strokeDasharray="2 4"
          strokeWidth="1"
        />
      ))}

      <path d={areaPath} fill="url(#trendfill)" />

      {hasOverlay && overlayPath && (
        <path
          d={overlayPath}
          stroke="var(--ink-3)"
          strokeWidth="1.4"
          fill="none"
          strokeLinejoin="round"
          strokeDasharray="4 4"
          opacity="0.7"
        />
      )}

      <path
        d={mainPath}
        stroke="var(--accent)"
        strokeWidth="1.8"
        fill="none"
        strokeLinejoin="round"
      />

      {peak && (
        <g>
          <circle
            cx={peak.pt[0]}
            cy={peak.pt[1]}
            r="4"
            fill="var(--accent)"
            stroke="var(--bg-elev)"
            strokeWidth="2"
          />
          <text
            x={peak.pt[0]}
            y={peak.pt[1] - 10}
            textAnchor="middle"
            fontSize="10"
            fill="var(--ink-2)"
            fontFamily="var(--sans)"
          >
            {fmt(peak.v)}
          </text>
        </g>
      )}

      {trough && trough.i !== peak?.i && (
        <g>
          <circle
            cx={trough.pt[0]}
            cy={trough.pt[1]}
            r="3.5"
            fill="var(--bg-elev)"
            stroke="var(--ink-3)"
            strokeWidth="1.5"
          />
          <text
            x={trough.pt[0]}
            y={trough.pt[1] + 16}
            textAnchor="middle"
            fontSize="10"
            fill="var(--ink-3)"
            fontFamily="var(--sans)"
          >
            {fmt(trough.v)}
          </text>
        </g>
      )}

      <text
        x={padX}
        y={h - 10}
        textAnchor="start"
        fontSize="10"
        fill="var(--ink-3)"
        fontFamily="var(--sans)"
      >
        {series[0]!.date}
      </text>
      <text
        x={w - padX}
        y={h - 10}
        textAnchor="end"
        fontSize="10"
        fill="var(--ink-3)"
        fontFamily="var(--sans)"
      >
        {series[series.length - 1]!.date}
      </text>
    </svg>
  );
}
