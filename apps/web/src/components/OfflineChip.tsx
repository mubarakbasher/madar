"use client";

import { useTranslations } from "next-intl";
import { useOnlineStatus } from "@/lib/offline/online-status";

/**
 * Small status chip — green dot when online + empty queue; amber when syncing
 * or holding queued items; rose when offline.
 */
export function OfflineChip(): JSX.Element {
  const t = useTranslations("pos.offline");
  const online = useOnlineStatus((s) => s.online);
  const queueDepth = useOnlineStatus((s) => s.queueDepth);
  const syncing = useOnlineStatus((s) => s.syncing);

  const { tone, label } = (() => {
    if (!online) {
      return { tone: "danger" as const, label: t("statusOffline", { count: queueDepth }) };
    }
    if (syncing) {
      return { tone: "warning" as const, label: t("statusSyncing", { count: queueDepth }) };
    }
    if (queueDepth > 0) {
      return { tone: "warning" as const, label: t("statusPending", { count: queueDepth }) };
    }
    return { tone: "neutral" as const, label: t("statusOnline") };
  })();

  const dot =
    tone === "danger"
      ? "var(--rose)"
      : tone === "warning"
        ? "var(--amber, #B07A2A)"
        : "var(--sage)";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        background: "var(--bg-elev)",
        border: "1px solid var(--rule)",
        fontSize: 12,
        color: "var(--ink-2)",
        fontFamily: "var(--sans)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: dot,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}
