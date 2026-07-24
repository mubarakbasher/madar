"use client";

import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Link } from "../../i18n/routing";

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("common.errorBoundary");

  return (
    <div role="alert" style={{ textAlign: "center", paddingBlock: "var(--space-8)" }}>
      <CircleAlert
        size={40}
        strokeWidth={1.5}
        aria-hidden="true"
        style={{ color: "var(--ink-4)", marginBlockEnd: "var(--space-4)" }}
      />
      <h1 className="serif" style={{ fontSize: 26, margin: 0, marginBlockEnd: "var(--space-2)" }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--ink-3)", maxWidth: 420, marginInline: "auto", marginBlockEnd: "var(--space-5)" }}>
        {t("body")}
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "center" }}>
        {onRetry ? (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {t("retry")}
          </button>
        ) : null}
        <Link href="/" className="btn">
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
