"use client";
import { useTranslations } from "next-intl";

export function InventorySkeleton() {
  const t = useTranslations("inventory.skeleton");
  return (
    <div
      className="inv-skeleton"
      style={{ padding: "var(--space-5) 0" }}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{t("loading")}</span>
      <div
        className="inv-skel-card"
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 12,
          background: "var(--paper)",
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="inv-skel-row"
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr 1fr 80px 80px 80px 120px 60px",
              gap: "var(--space-4)",
              padding: "var(--space-4) 20px",
              borderBottom: i < 5 ? "1px solid var(--rule)" : "none",
              alignItems: "center",
            }}
          >
            {Array.from({ length: 8 }).map((__, j) => (
              <Bar key={j} width={j === 1 ? "70%" : j === 2 ? "55%" : "100%"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ width }: { width: string }) {
  return (
    <div
      style={{
        height: 12,
        width,
        background: "var(--bg-elev)",
        borderRadius: "var(--radius-sm)",
        opacity: 0.7,
      }}
    />
  );
}
