import { Building2 } from "lucide-react";
import { t } from "@/lib/i18n";

export function TenantsEmpty({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <div className="admin-empty">
      <Building2
        size={40}
        strokeWidth={1.5}
        aria-hidden="true"
        style={{ color: "var(--ink-4)", marginBottom: 12 }}
      />
      <p className="admin-empty-title">
        {filtered ? t("tenants.empty.filteredTitle") : t("tenants.empty.defaultTitle")}
      </p>
      <p className="admin-empty-body">
        {filtered
          ? t("tenants.empty.filteredBody")
          : t("tenants.empty.defaultBody")}
      </p>
      {filtered && onClearFilters ? (
        <button
          type="button"
          className="admin-tb-action"
          style={{ marginTop: 14 }}
          onClick={onClearFilters}
        >
          {t("tenants.empty.clearFilters")}
        </button>
      ) : null}
    </div>
  );
}
