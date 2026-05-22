"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CreditCard } from "lucide-react";
import { Link, usePathname, useRouter } from "../../../../../i18n/routing";
import { useAuthStore } from "@/lib/auth/store";

const TRIAL_REMINDER_THRESHOLD_DAYS = 3;

// Routes that stay reachable when the tenant is suspended/cancelled. The
// allowlist mirrors the backend `TenantAuthGuard` allowlist (see
// apps/api/src/tenant/auth/tenant-auth.guard.ts).
const ALLOWED_WHEN_LOCKED = [
  "/billing",
  "/settings/security",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

function isLockedAllowed(pathname: string): boolean {
  return ALLOWED_WHEN_LOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / 86400000);
}

export function SubscriptionBanner() {
  const tenant = useAuthStore((s) => s.tenant);
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("subscription.banner");

  const status = tenant?.status ?? null;
  const trialDaysLeft = useMemo(() => daysUntil(tenant?.trial_ends_at ?? null), [tenant?.trial_ends_at]);

  // Client-side route guard. Backend already rejects writes with 423; this
  // adds the read redirect so a suspended cashier doesn't sit on /pos.
  useEffect(() => {
    if (!status) return;
    if (status !== "suspended" && status !== "cancelled") return;
    if (isLockedAllowed(pathname)) return;
    router.replace("/billing");
  }, [status, pathname, router]);

  if (!tenant || !status) return null;

  // 1. Trial ending in ≤3 days — coral nudge.
  if (
    status === "trialing" &&
    trialDaysLeft !== null &&
    trialDaysLeft >= 0 &&
    trialDaysLeft <= TRIAL_REMINDER_THRESHOLD_DAYS
  ) {
    return (
      <SubscriptionBannerShell tone="coral">
        <AlertTriangle size={14} strokeWidth={1.75} aria-hidden />
        <span style={{ flex: 1 }}>
          {t("trialEndingBody", { days: trialDaysLeft })}
        </span>
        <BannerCta href="/billing" label={t("trialEndingCta")} tone="coral" />
      </SubscriptionBannerShell>
    );
  }

  // 2. Grace period — amber warning, still functional.
  if (status === "grace_period") {
    return (
      <SubscriptionBannerShell tone="amber">
        <AlertTriangle size={14} strokeWidth={1.75} aria-hidden />
        <span style={{ flex: 1 }}>{t("graceBody")}</span>
        <BannerCta href="/billing" label={t("payNow")} tone="amber" />
      </SubscriptionBannerShell>
    );
  }

  // 3. Suspended — rose, read-only.
  if (status === "suspended") {
    return (
      <SubscriptionBannerShell tone="rose">
        <AlertTriangle size={14} strokeWidth={1.75} aria-hidden />
        <span style={{ flex: 1 }}>
          <strong>{t("suspendedTitle")}</strong> — {t("suspendedBody")}
        </span>
        <BannerCta href="/billing" label={t("payNow")} tone="rose" />
      </SubscriptionBannerShell>
    );
  }

  // 4. Cancelled — rose, export-only window.
  if (status === "cancelled") {
    return (
      <SubscriptionBannerShell tone="rose">
        <AlertTriangle size={14} strokeWidth={1.75} aria-hidden />
        <span style={{ flex: 1 }}>
          <strong>{t("cancelledTitle")}</strong> — {t("cancelledBody")}
        </span>
        <BannerCta href="/billing" label={t("exportCta")} tone="rose" />
      </SubscriptionBannerShell>
    );
  }

  return null;
}

function SubscriptionBannerShell({
  tone,
  children,
}: {
  tone: "coral" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const tones: Record<typeof tone, { bg: string; fg: string }> = {
    coral: {
      bg: "linear-gradient(90deg, var(--accent) 0%, var(--accent-strong) 100%)",
      fg: "white",
    },
    amber: {
      bg: "linear-gradient(90deg, var(--amber, #c08a3e) 0%, color-mix(in oklab, var(--amber, #c08a3e) 80%, #000) 100%)",
      fg: "white",
    },
    rose: {
      bg: "linear-gradient(90deg, var(--rose) 0%, color-mix(in oklab, var(--rose) 75%, #000) 100%)",
      fg: "white",
    },
  };
  return (
    <div
      role="status"
      style={{
        gridColumn: "1 / -1",
        background: tones[tone].bg,
        color: tones[tone].fg,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        position: "sticky",
        insetBlockStart: 0,
        zIndex: 49,
      }}
    >
      {children}
    </div>
  );
}

function BannerCta({
  href,
  label,
  tone,
}: {
  href: "/billing";
  label: string;
  tone: "coral" | "amber" | "rose";
}) {
  const ctaFg = {
    coral: "var(--accent-strong)",
    amber: "var(--amber, #c08a3e)",
    rose: "var(--rose)",
  }[tone];
  return (
    <Link
      href={href}
      style={{
        background: "white",
        color: ctaFg,
        padding: "6px 14px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <CreditCard size={13} strokeWidth={1.75} />
      {label}
    </Link>
  );
}
