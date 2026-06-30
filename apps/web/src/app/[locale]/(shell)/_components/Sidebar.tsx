"use client";

import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  ShoppingCart,
  Receipt,
  Package,
  RotateCw,
  Truck,
  Send,
  Undo2,
  MapPin,
  Banknote,
  BarChart3,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  Settings,
  HelpCircle,
  Users,
  ClipboardList,
  Armchair,
  type LucideIcon,
} from "lucide-react";
import { MadarMark } from "@madar/ui";
import { Link, usePathname } from "../../../../../i18n/routing";
import { useAuthStore } from "@/lib/auth/store";
import { businessGetRequest } from "@/lib/api/business";
import { branchesListRequest } from "@/lib/api/branches";

type NavItem = {
  id: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
  badgeKey?: string;
  roleGuard?: (role: string) => boolean;
};

type NavSection = {
  titleKey: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    titleKey: "operations",
    items: [
      { id: "dashboard", href: "/", icon: Home, enabled: true },
      { id: "checkout", href: "/pos", icon: ShoppingCart, enabled: true, badgeKey: "checkoutBadge" },
      { id: "sales", href: "/sales", icon: Receipt, enabled: true },
      { id: "inventory", href: "/inventory", icon: Package, enabled: true },
      {
        id: "transfers",
        href: "/transfers",
        icon: RotateCw,
        enabled: true,
        roleGuard: (role) => role === "owner" || role === "manager",
      },
    ],
  },
  {
    titleKey: "network",
    items: [
      {
        id: "suppliers",
        href: "/suppliers",
        icon: Truck,
        enabled: true,
        roleGuard: (role) =>
          role === "owner" || role === "manager" || role === "accountant",
      },
      {
        id: "purchases",
        href: "/purchases",
        icon: Send,
        enabled: true,
        roleGuard: (role) =>
          role === "owner" || role === "manager" || role === "accountant",
      },
      {
        id: "returns",
        href: "/returns",
        icon: Undo2,
        enabled: true,
        roleGuard: (role) => role === "owner" || role === "manager",
      },
      { id: "branches", href: "/branches", icon: MapPin, enabled: true },
      { id: "customers", href: "/customers", icon: Users, enabled: true },
      {
        id: "assets",
        href: "/assets",
        icon: Armchair,
        enabled: true,
        roleGuard: (role) => role === "owner" || role === "manager",
      },
    ],
  },
  {
    titleKey: "money",
    items: [
      {
        id: "shifts",
        href: "/shifts",
        icon: ClipboardList,
        enabled: true,
        roleGuard: (role) =>
          role === "owner" || role === "manager" || role === "cashier" || role === "accountant",
      },
      {
        id: "verification",
        href: "/sales/verification",
        icon: ShieldCheck,
        enabled: true,
        roleGuard: (role) => role === "owner" || role === "manager",
      },
      {
        id: "syncConflicts",
        href: "/sales/sync-conflicts",
        icon: AlertTriangle,
        enabled: true,
        roleGuard: (role) =>
          role === "owner" || role === "manager" || role === "auditor",
      },
      {
        id: "reconcile",
        href: "/reconcile",
        icon: Banknote,
        enabled: true,
        roleGuard: (role) =>
          role === "owner" || role === "manager" || role === "accountant",
      },
      {
        id: "reports",
        href: "/reports",
        icon: BarChart3,
        enabled: true,
        roleGuard: (role) =>
          role === "owner" ||
          role === "manager" ||
          role === "accountant" ||
          role === "auditor",
      },
      {
        id: "billing",
        href: "/billing",
        icon: Landmark,
        enabled: true,
        roleGuard: (role) => role === "owner" || role === "accountant",
      },
    ],
  },
];

const FOOT: NavItem[] = [
  { id: "settings", href: "/settings", icon: Settings, enabled: true },
  { id: "help", href: "/help", icon: HelpCircle, enabled: false },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const tShell = useTranslations("shell");
  const tNav = useTranslations("shell.nav");
  const tSec = useTranslations("shell.section");
  const tMerch = useTranslations("shell.merchant");
  const locale = useLocale();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const role = user?.role ?? "";

  // Real store identity for the sidebar footer. `/v1/tenant` is open to every
  // tenant role; the auth-store name is an instant fallback before it resolves.
  const businessQ = useQuery({
    queryKey: ["tenant", "business"],
    queryFn: () => businessGetRequest(),
    staleTime: 300_000,
  });
  const branchesQ = useQuery({
    queryKey: ["branches", "list", { include_inactive: false }],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    staleTime: 60_000,
  });
  const storeName = businessQ.data
    ? businessQ.data.name_i18n[locale === "ar" ? "ar" : "en"] || businessQ.data.name
    : tenant?.name ?? "";
  const avatar = storeName.trim().charAt(0).toUpperCase() || "·";
  const branchCount = branchesQ.data?.items.length ?? null;

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-mark">
          <MadarMark size={20} />
        </div>
        <div className="sb-name">
          {tShell("brand")}
          <small>{tShell("brandSub")}</small>
        </div>
      </div>

      <div className="sb-scroll">
        {SECTIONS.map((section) => (
          <div key={section.titleKey}>
            <div className="sb-section">{tSec(section.titleKey)}</div>
            <nav className="sb-nav">
              {section.items
                .filter((item) => !item.roleGuard || item.roleGuard(role))
                .map((item) => {
                const Icon = item.icon;
                const active = item.enabled && isActive(pathname, item.href);
                const label = tNav(item.id);
                const badge = item.badgeKey ? tNav(item.badgeKey) : null;

                if (!item.enabled) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="sb-item"
                      aria-disabled="true"
                      tabIndex={-1}
                    >
                      <Icon className="sb-ico" size={18} strokeWidth={1.5} />
                      <span className="sb-item-label">{label}</span>
                      <span className="sb-soon">{tNav("soon")}</span>
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    href={
                      item.href as
                        | "/"
                        | "/pos"
                        | "/sales"
                        | "/inventory"
                        | "/transfers"
                        | "/suppliers"
                        | "/purchases"
                        | "/returns"
                        | "/branches"
                        | "/customers"
                        | "/assets"
                        | "/shifts"
                        | "/sales/verification"
                        | "/sales/sync-conflicts"
                        | "/reconcile"
                        | "/reports"
                        | "/billing"
                        | "/settings"
                    }
                    className="sb-item"
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="sb-ico" size={18} strokeWidth={1.5} />
                    <span className="sb-item-label">{label}</span>
                    {badge && <span className="sb-badge">{badge}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="sb-merchant">
          <div className="sb-merchant-avatar">{avatar}</div>
          <div className="sb-merchant-meta">
            <b>{storeName}</b>
            {branchCount != null && <small>{tMerch("branches", { count: branchCount })}</small>}
          </div>
        </div>
      </div>

      <div className="sb-foot">
        {FOOT.map((item) => {
          const Icon = item.icon;
          const active = item.enabled && isActive(pathname, item.href);
          const label = tNav(item.id);

          if (!item.enabled) {
            return (
              <button
                key={item.id}
                type="button"
                className="sb-item"
                aria-disabled="true"
                tabIndex={-1}
              >
                <Icon className="sb-ico" size={18} strokeWidth={1.5} />
                <span className="sb-foot-label sb-item-label">{label}</span>
                <span className="sb-soon">{tNav("soon")}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href as "/settings"}
              className="sb-item"
              aria-current={active ? "page" : undefined}
            >
              <Icon className="sb-ico" size={18} strokeWidth={1.5} />
              <span className="sb-foot-label sb-item-label">{label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
