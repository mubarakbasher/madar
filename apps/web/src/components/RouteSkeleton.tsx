import { useTranslations } from "next-intl";

/* Generic route-transition skeleton: kicker + title + filter row + table card.
   Reserves realistic heights so content streaming in does not shift layout. */
export function RouteSkeleton() {
  const t = useTranslations("common");

  return (
    <div className="content-inner" aria-busy="true">
      <div className="skel" style={{ width: 96, height: 11, marginBlockEnd: "var(--space-3)" }} />
      <div className="skel" style={{ width: 260, height: 28, marginBlockEnd: "var(--space-5)" }} />
      <div style={{ display: "flex", gap: "var(--space-2)", marginBlockEnd: "var(--space-4)" }}>
        <div className="skel" style={{ width: 220, height: 34 }} />
        <div className="skel" style={{ width: 120, height: 34 }} />
        <div className="skel" style={{ width: 120, height: 34 }} />
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 40 }} />
        ))}
      </div>
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
