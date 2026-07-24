"use client";

/* eslint-disable i18next/no-literal-string --
   Renders outside the locale segment and i18n provider (root-layout
   crashes only), so static bilingual text is the only option. */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

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
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong · حدث خطأ ما</h1>
          <p style={{ color: "#6B6259", marginBottom: 20 }}>
            An unexpected error occurred. Please try again. · حدث خطأ غير متوقع، حاول مرة أخرى.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: 0,
              background: "#C8553D",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again · حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}
