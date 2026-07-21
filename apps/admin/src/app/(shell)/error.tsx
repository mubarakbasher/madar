"use client";

import { t } from "@/lib/i18n";

export default function ShellError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="admin-error" role="alert">
      <p className="admin-error-title">{t("common.errorBoundary.title")}</p>
      <p className="admin-error-body" style={{ marginBottom: 14 }}>
        {t("common.errorBoundary.body")}
      </p>
      <button type="button" className="admin-tb-action" onClick={reset}>
        {t("common.errorBoundary.retry")}
      </button>
    </div>
  );
}
