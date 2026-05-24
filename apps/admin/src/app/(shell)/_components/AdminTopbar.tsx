"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Moon, Search, Sun } from "lucide-react";
import { useAdminAuthStore } from "@/lib/auth/store";
import { adminLogout } from "@/lib/api/admin-auth";
import { t } from "@/lib/i18n";

function crumbFor(pathname: string): string {
  if (pathname === "/") return t("topbar.crumb.dashboard");
  if (pathname.startsWith("/tenants")) return t("topbar.crumb.tenants");
  if (pathname.startsWith("/verification")) return t("topbar.crumb.verificationQueue");
  if (pathname.startsWith("/invoices")) return t("topbar.crumb.invoices");
  if (pathname.startsWith("/login-audit")) return t("topbar.crumb.loginAsAudit");
  if (pathname.startsWith("/platform-audit")) return t("topbar.crumb.platformAudit");
  return t("topbar.crumb.admin");
}

const THEME_KEY = "madar_admin_theme";
type Theme = "light" | "dark";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const stored = (typeof window !== "undefined" ? localStorage.getItem(THEME_KEY) : null) as Theme | null;
    const initial: Theme = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  };
  return [theme, toggle];
}

export function AdminTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useAdminAuthStore((s) => s.clearAuth);
  const [signingOut, setSigningOut] = useState(false);
  const [theme, toggleTheme] = useTheme();

  const crumb = crumbFor(pathname);
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await adminLogout();
    } catch {
      /* ignore — clear local state regardless */
    }
    clearAuth();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="admin-topbar">
      <div>
        <span className="admin-crumb">{crumb}</span>
        <span className="admin-crumb-sub">{today}</span>
      </div>
      <div className="admin-tb-spacer" />
      <div className="admin-tb-search">
        <Search size={13} strokeWidth={1.5} />
        <input placeholder={t("topbar.searchPlaceholder")} aria-label={t("topbar.searchLabel")} disabled />
      </div>
      <span className="admin-tb-pill">{t("topbar.systemNominal")}</span>
      <button
        type="button"
        className="admin-tb-action"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? t("topbar.switchToLight") : t("topbar.switchToDark")}
        title={theme === "dark" ? t("topbar.lightMode") : t("topbar.darkMode")}
        style={{ padding: "6px 10px" }}
      >
        {theme === "dark" ? <Sun size={14} strokeWidth={1.5} /> : <Moon size={14} strokeWidth={1.5} />}
      </button>
      <button
        type="button"
        className="admin-tb-action"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? t("topbar.signingOut") : t("topbar.signOut")}
      </button>
    </header>
  );
}
