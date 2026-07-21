"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { t } from "@/lib/i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // Root-layout crash: tokens.css may not be loaded, so inline literal
  // colors mirror the admin light theme.
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          margin: 0,
          background: "#FAF7F2",
          color: "#1A1714",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("common.errorBoundary.title")}</h1>
          <p style={{ color: "#6B6259", marginBottom: 20 }}>{t("common.errorBoundary.body")}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: 0,
              background: "#4A6B7A",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("common.errorBoundary.retry")}
          </button>
        </div>
      </body>
    </html>
  );
}
