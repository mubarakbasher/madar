"use client";

import { ErrorState } from "@/components/ErrorState";

export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--space-5)" }}>
      <ErrorState onRetry={reset} />
    </main>
  );
}
