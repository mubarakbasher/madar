import { t } from "@/lib/i18n";

export function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <div className="admin-skel" style={{ height: 60, marginBottom: 28 }} />
      <div className="admin-kpi-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="admin-skel" />
        ))}
      </div>
      <div className="admin-activity-grid">
        <div className="admin-skel" style={{ height: 240 }} />
        <div className="admin-skel" style={{ height: 240 }} />
      </div>
      <span className="sr-only">{t("dashboard.loadingSr")}</span>
    </div>
  );
}
