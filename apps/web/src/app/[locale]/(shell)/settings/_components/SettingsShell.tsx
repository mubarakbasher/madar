"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck, User, Briefcase, Users, Receipt, Bell } from "lucide-react";
import { Link, usePathname } from "../../../../../../i18n/routing";
import { useAuthStore } from "@/lib/auth/store";

type ItemId = "security" | "profile" | "business" | "notifications" | "users" | "taxClasses";
type Item = {
  id: ItemId;
  href: string;
  icon: typeof ShieldCheck;
  enabled: boolean;
  /** If set, only roles listed here see the tab. Undefined = all signed-in users. */
  visibleToRoles?: ReadonlyArray<string>;
};

const ITEMS: Item[] = [
  { id: "security", href: "/settings/security", icon: ShieldCheck, enabled: true },
  { id: "profile", href: "/settings/profile", icon: User, enabled: true },
  { id: "business", href: "/settings/business", icon: Briefcase, enabled: true, visibleToRoles: ["owner"] },
  {
    id: "notifications",
    href: "/settings/notifications",
    icon: Bell,
    enabled: true,
    visibleToRoles: ["owner", "manager"],
  },
  // Owner-only — the underlying /v1/users endpoints all `assertOwner`, so we
  // hide the entry entirely for everyone else rather than showing a 403 page.
  { id: "users", href: "/settings/users", icon: Users, enabled: true, visibleToRoles: ["owner"] },
  // Owner-only — tax-class mutations are owner-only on the API side.
  {
    id: "taxClasses",
    href: "/settings/tax-classes",
    icon: Receipt,
    enabled: true,
    visibleToRoles: ["owner"],
  },
];

export function SettingsShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("settings.nav");
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role ?? "");
  void locale;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: "var(--space-5)",
        maxWidth: 1100,
        margin: "0 auto",
        padding: "var(--space-5)",
      }}
    >
      <aside>
        <h2
          style={{
            fontFamily: "var(--serif, Fraunces, serif)",
            fontSize: 18,
            marginBottom: "var(--space-3)",
            color: "var(--ink-1)",
          }}
        >
          {t("title")}
        </h2>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {ITEMS.filter((it) => !it.visibleToRoles || it.visibleToRoles.includes(role)).map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            const Icon = it.icon;
            const inner = (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-2) 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  color: active ? "var(--accent)" : "var(--ink-2)",
                  background: active
                    ? "color-mix(in oklab, var(--accent) 10%, transparent)"
                    : "transparent",
                  opacity: it.enabled ? 1 : 0.45,
                }}
              >
                <Icon size={14} strokeWidth={1.5} />
                <span style={{ flex: 1 }}>{t(it.id)}</span>
                {!it.enabled && (
                  <span style={{ fontSize: 10, color: "var(--ink-3)" }}>·</span>
                )}
              </span>
            );
            return it.enabled ? (
              <Link key={it.id} href={it.href}>
                {inner}
              </Link>
            ) : (
              <div key={it.id} aria-disabled>
                {inner}
              </div>
            );
          })}
        </nav>
      </aside>
      <main>{children}</main>
    </div>
  );
}
