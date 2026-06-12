import type { CSSProperties, SVGProps } from "react";

/**
 * Madar brand mark — the "crescent orbit": an open ring with the satellite
 * resting in the gap and the planet at center. مدار = orbit.
 *
 * Draws in `currentColor`, so the admin slate-teal theme and dark mode both
 * recolor it with zero component changes. Server-component safe (no hooks).
 */
export function MadarMark({
  size = 36,
  ...props
}: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M 24 9 A 15 15 0 1 0 39 24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="34.6" cy="13.4" r="4" fill="currentColor" />
      <circle cx="24" cy="24" r="5" fill="currentColor" />
    </svg>
  );
}

/**
 * Mark + wordmark lockup. The wordmark stays real text (display serif via
 * `--serif`, which flips to the Arabic serif under `html[lang="ar"]`), so
 * callers pass the localized brand name from their own messages.
 */
export function MadarLogo({
  name,
  size = 32,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.3, ...style }}
    >
      <MadarMark size={size} style={{ color: "var(--accent)" }} />
      <span
        className="serif"
        style={{
          fontFamily: "var(--serif)",
          fontSize: size * 0.65,
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {name}
      </span>
    </span>
  );
}
