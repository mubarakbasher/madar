import type { TenantStatus } from "@/lib/api/admin-tenants";
import { t } from "@/lib/i18n";

const STATUS_MAP: Record<TenantStatus, { label: string; color: string; bg: string }> = {
  trialing: { label: t("status.trial"), color: "var(--accent-ink)", bg: "var(--accent-soft)" },
  active: { label: t("status.active"), color: "var(--sage)", bg: "var(--sage-soft)" },
  grace_period: { label: t("status.inGrace"), color: "var(--amber)", bg: "var(--amber-soft)" },
  suspended: { label: t("status.suspended"), color: "var(--rose)", bg: "var(--rose-soft)" },
  cancelled: { label: t("status.cancelled"), color: "var(--ink-3)", bg: "var(--bg-sunk)" },
};

export function StatusChip({ status }: { status: TenantStatus }) {
  const cfg = STATUS_MAP[status];
  return (
    <span
      className="admin-status-chip"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}
