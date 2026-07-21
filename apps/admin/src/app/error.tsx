"use client";

import { t } from "@/lib/i18n";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="admin-error" role="alert">
        <p className="admin-error-title">{t("common.errorBoundary.title")}</p>
        <p className="admin-error-body" style={{ marginBottom: 14 }}>
          {t("common.errorBoundary.body")}
        </p>
        <button type="button" className="admin-tb-action" onClick={reset}>
          {t("common.errorBoundary.retry")}
        </button>
      </div>
    </main>
  );
}
