import { t } from "@/lib/i18n";

export function TenantsEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="admin-empty">
      <p className="admin-empty-title">
        {filtered ? t("tenants.empty.filteredTitle") : t("tenants.empty.defaultTitle")}
      </p>
      <p className="admin-empty-body">
        {filtered
          ? t("tenants.empty.filteredBody")
          : t("tenants.empty.defaultBody")}
      </p>
    </div>
  );
}
