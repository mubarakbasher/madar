import { t } from "@/lib/i18n";

export function TenantsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="admin-error" role="alert">
      <p className="admin-error-title">{t("tenants.error.title")}</p>
      <p className="admin-error-body" style={{ marginBottom: 14 }}>
        {t("tenants.error.body")}
      </p>
      <button type="button" className="admin-tb-action" onClick={onRetry}>
        {t("tenants.error.retry")}
      </button>
    </div>
  );
}
