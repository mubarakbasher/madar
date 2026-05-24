import { t } from "@/lib/i18n";

export function TenantsSkeleton() {
  return (
    <div aria-busy="true">
      <div className="admin-skel" style={{ height: 40, marginBottom: 18 }} />
      <div className="admin-skel" style={{ height: 320 }} />
      <span className="sr-only">{t("tenants.skeleton.sr")}</span>
    </div>
  );
}
