"use client";

import { useId } from "react";

/**
 * 24-bar hourly revenue chart — hand-rolled SVG. Single-color primary,
 * dashed midline, no 3D, no library. Follows the "calm, editorial"
 * direction from CLAUDE.md (charts section).
 */
export function HourlyChart({
  data,
  label,
  height = 180,
  width = 720,
}: {
  data: Array<{ hour: number; cents: number }>;
  label: string;
  height?: number;
  width?: number;
}) {
  const gradientId = useId();
  const max = Math.max(1, ...data.map((d) => d.cents));
  const barW = (width - 32) / 24;
  const baseY = height - 28;
  const topPad = 16;
  const usable = baseY - topPad;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={label}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Dashed midline */}
      <line
        x1={16}
        x2={width - 16}
        y1={topPad + usable / 2}
        y2={topPad + usable / 2}
        stroke="var(--rule)"
        strokeDasharray="2 4"
      />

      {data.map((d) => {
        const h = (d.cents / max) * usable;
        const x = 16 + d.hour * barW;
        const y = baseY - h;
        return (
          <g key={d.hour}>
            <rect
              x={x + 2}
              y={y}
              width={barW - 4}
              height={Math.max(2, h)}
              fill={`url(#${gradientId})`}
              rx={2}
            />
          </g>
        );
      })}

      {/* Hour labels: 0, 6, 12, 18, 23 */}
      {[0, 6, 12, 18, 23].map((h) => (
        <text
          key={h}
          x={16 + h * barW + barW / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize="10"
          fill="var(--ink-3)"
        >
          {String(h).padStart(2, "0")}:00
        </text>
      ))}
    </svg>
  );
}
