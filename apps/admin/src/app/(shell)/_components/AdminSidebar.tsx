"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Inbox,
  FileText,
  Landmark,
  Package,
  Shield,
  History,
  ScrollText,
  Settings,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MadarMark } from "@madar/ui";
import { useAdminAuthStore } from "@/lib/auth/store";
import { adminFetchKpi } from "@/lib/api/admin-dashboard";
import { t } from "@/lib/i18n";

type NavItem = {
  label: string;
  href: string;
  Icon: typeof LayoutDashboard;
  disabled?: boolean;
  badge?: number;
};

function buildSections(
  pendingVerifications: number,
  isOwner: boolean,
): Array<{ kicker: string; items: NavItem[] }> {
  return [
    {
      kicker: t("sidebar.operations"),
      items: [
        { label: t("sidebar.dashboard"), href: "/", Icon: LayoutDashboard },
        { label: t("sidebar.tenants"), href: "/tenants", Icon: Users },
      ],
    },
    {
      kicker: t("sidebar.billing"),
      items: [
        {
          label: t("sidebar.verificationQueue"),
          href: "/verification",
          Icon: Inbox,
          badge: pendingVerifications > 0 ? pendingVerifications : undefined,
        },
        { label: t("sidebar.invoices"), href: "/invoices", Icon: FileText },
        { label: t("sidebar.bankAccounts"), href: "/banking", Icon: Landmark },
      ],
    },
    ...(isOwner
      ? [
          {
            kicker: t("sidebar.pricing"),
            items: [{ label: t("sidebar.plans"), href: "/plans", Icon: Package } as NavItem],
          },
        ]
      : []),
    {
      kicker: t("sidebar.security"),
      items: [
        { label: t("sidebar.superAdminTeam"), href: "/team", Icon: Shield },
        { label: t("sidebar.loginAsAudit"), href: "/login-audit", Icon: History },
        { label: t("sidebar.platformAudit"), href: "/platform-audit", Icon: ScrollText },
      ],
    },
  ];
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const user = useAdminAuthStore((s) => s.user);
  const kpiQuery = useQuery({
    queryKey: ["admin", "dashboard", "kpi"],
    queryFn: adminFetchKpi,
    staleTime: 60_000,
  });
  const SECTIONS = buildSections(kpiQuery.data?.pending_verifications.count ?? 0, user?.role === "owner");

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <div className="admin-brand-mark">
          <MadarMark size={24} />
        </div>
        <div className="admin-brand-text">
          <span className="admin-brand-name">{t("brand.name")}</span>
          <span className="admin-brand-tag">{t("brand.tag")}</span>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div className="admin-nav-section" key={section.kicker}>
          <span className="admin-nav-kicker">{section.kicker}</span>
          {section.items.map((item) => {
            const active = !item.disabled && isActive(pathname, item.href);
            const inner = (
              <>
                <item.Icon className="admin-nav-ico" strokeWidth={1.5} />
                <span className="admin-nav-label">{item.label}</span>
                {item.disabled ? <span className="admin-soon-pill">{t("sidebar.soon")}</span> : null}
                {item.badge != null ? <span className="admin-nav-badge">{item.badge}</span> : null}
              </>
            );
            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className="admin-nav-item"
                  aria-disabled="true"
                  title={t("sidebar.comingSoon")}
                >
                  {inner}
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className="admin-nav-item"
                aria-current={active ? "page" : undefined}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="admin-sidebar-foot">
        <div className="admin-sidebar-avatar">
          {(user?.name ?? "A").slice(0, 1).toUpperCase()}
        </div>
        <div className="admin-sidebar-who">
          {user?.name ?? t("sidebar.admin")}
          <small>{user?.role ?? ""}</small>
        </div>
        <span className="admin-soon-pill" aria-disabled="true" title={t("sidebar.settingsSoon")}>
          <Settings size={12} strokeWidth={1.5} />
        </span>
      </div>
    </aside>
  );
}
