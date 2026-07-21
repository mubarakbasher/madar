"use client";

import { ErrorState } from "@/components/ErrorState";

export default function ShellError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="content-inner">
      <ErrorState onRetry={reset} />
    </div>
  );
}
