import type { TenantStatus } from "@/lib/api/admin-tenants";

const STATUS_MAP: Record<TenantStatus, { label: string; color: string; bg: string }> = {
  trialing: { label: "Trial", color: "var(--accent-ink)", bg: "var(--accent-soft)" },
  active: { label: "Active", color: "var(--sage)", bg: "var(--sage-soft)" },
  grace_period: { label: "In grace", color: "var(--amber)", bg: "var(--amber-soft)" },
  suspended: { label: "Suspended", color: "var(--rose)", bg: "var(--rose-soft)" },
  cancelled: { label: "Cancelled", color: "var(--ink-3)", bg: "var(--bg-sunk)" },
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
