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
import { useAdminAuthStore } from "@/lib/auth/store";
import { adminFetchKpi } from "@/lib/api/admin-dashboard";

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
      kicker: "Operations",
      items: [
        { label: "Dashboard", href: "/", Icon: LayoutDashboard },
        { label: "Tenants", href: "/tenants", Icon: Users },
      ],
    },
    {
      kicker: "Billing",
      items: [
        {
          label: "Verification queue",
          href: "/verification",
          Icon: Inbox,
          badge: pendingVerifications > 0 ? pendingVerifications : undefined,
        },
        { label: "Invoices", href: "/invoices", Icon: FileText },
        { label: "Bank accounts", href: "/banking", Icon: Landmark, disabled: true },
      ],
    },
    ...(isOwner
      ? [
          {
            kicker: "Pricing",
            items: [{ label: "Plans", href: "/plans", Icon: Package } as NavItem],
          },
        ]
      : []),
    {
      kicker: "Security",
      items: [
        { label: "Super-admin team", href: "/team", Icon: Shield, disabled: true },
        { label: "Login-as audit", href: "/login-audit", Icon: History },
        { label: "Platform audit", href: "/platform-audit", Icon: ScrollText },
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
        <div className="admin-brand-mark">M</div>
        <div className="admin-brand-text">
          <span className="admin-brand-name">Madar</span>
          <span className="admin-brand-tag">Admin</span>
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
                {item.disabled ? <span className="admin-soon-pill">Soon</span> : null}
                {item.badge != null ? <span className="admin-nav-badge">{item.badge}</span> : null}
              </>
            );
            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className="admin-nav-item"
                  aria-disabled="true"
                  title="Coming soon"
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
          {user?.name ?? "Admin"}
          <small>{user?.role ?? ""}</small>
        </div>
        <span className="admin-soon-pill" aria-disabled="true" title="Settings · soon">
          <Settings size={12} strokeWidth={1.5} />
        </span>
      </div>
    </aside>
  );
}
