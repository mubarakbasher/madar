"use client";

/**
 * 6-slice donut — hand-rolled SVG. Single-hue ramp on the accent token
 * so it stays in the "calm + warm" lane per CLAUDE.md.
 */
export function CategoriesDonut({
  data,
  locale,
  size = 180,
  labelMissing,
}: {
  data: Array<{
    category_id: string | null;
    category_code: string | null;
    name_i18n: { en: string; ar: string } | null;
    cents: number;
  }>;
  locale: "en" | "ar";
  size?: number;
  labelMissing: string;
}) {
  const total = data.reduce((sum, d) => sum + d.cents, 0);
  if (total === 0) return null;

  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 18;

  let cumulative = 0;
  const slices = data.map((d, i) => {
    const start = cumulative;
    cumulative += d.cents;
    const end = cumulative;
    const startAngle = (start / total) * 2 * Math.PI - Math.PI / 2;
    const endAngle = (end / total) * 2 * Math.PI - Math.PI / 2;
    return { d, i, startAngle, endAngle };
  });

  // Six muted variations of the accent.
  const opacities = [0.95, 0.78, 0.62, 0.48, 0.34, 0.22];

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Top categories donut">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--rule)" strokeWidth={stroke} />
        {slices.map(({ d, i, startAngle, endAngle }) => {
          const large = endAngle - startAngle > Math.PI ? 1 : 0;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          return (
            <path
              key={d.category_id ?? `uncat-${i}`}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity={opacities[i] ?? 0.2}
              strokeWidth={stroke}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {slices.map(({ d, i }) => {
          const name = d.name_i18n
            ? locale === "ar"
              ? d.name_i18n.ar || d.name_i18n.en
              : d.name_i18n.en
            : labelMissing;
          const pct = Math.round((d.cents / total) * 100);
          return (
            <li
              key={d.category_id ?? `uncat-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--accent)",
                  opacity: opacities[i] ?? 0.2,
                  borderRadius: 2,
                }}
              />
              <span style={{ color: "var(--ink-1)" }}>{name}</span>
              <span style={{ color: "var(--ink-3)" }}>· {pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
