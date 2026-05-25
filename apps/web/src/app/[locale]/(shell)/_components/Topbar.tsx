"use client";

import { useTranslations } from "next-intl";
import { Search, Bell, Sparkles } from "lucide-react";
import { usePathname } from "../../../../../i18n/routing";
import { BranchSwitcher } from "./BranchSwitcher";
import { LangSwitcher } from "./LangSwitcher";
import { UserMenu } from "./UserMenu";

function crumbKeyFor(pathname: string): "dashboard" | "checkout" | "inventory" | null {
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname.startsWith("/pos")) return "checkout";
  if (pathname.startsWith("/inventory")) return "inventory";
  return null;
}

export function Topbar({ locale }: { locale: string }) {
  const tShell = useTranslations("shell");
  const tBar = useTranslations("shell.topbar");
  const tCrumb = useTranslations("shell.crumb");
  const pathname = usePathname();
  const key = crumbKeyFor(pathname);
  const crumb = key ? tCrumb(key) : tShell("brand");
  const sub = key ? tCrumb(`${key}Sub`) : "";

  return (
    <div className="topbar">
      <div className="tb-crumb">
        <span className="serif">{crumb}</span>
        {sub && <span className="tb-crumb-sub"> · {sub}</span>}
      </div>
      <div className="tb-spacer" />

      <div className="tb-search">
        <Search size={14} strokeWidth={1.5} />
        <input placeholder={tBar("searchPlaceholder")} aria-label={tBar("searchPlaceholder")} />
        <kbd>{tBar("kbdHint")}</kbd>
      </div>

      <BranchSwitcher locale={locale} />

      <div className="tb-pill" data-state="online">
        <span className="dot" />
        {tBar("live")}
      </div>

      <LangSwitcher locale={locale} />

      <button type="button" className="tb-icon-btn" title={tBar("notifications")} aria-label={tBar("notifications")}>
        <Bell size={16} strokeWidth={1.5} />
        <span className="badge" />
      </button>

      <button type="button" className="tb-icon-btn" title={tBar("askMadar")} aria-label={tBar("askMadar")}>
        <Sparkles size={16} strokeWidth={1.5} />
      </button>

      <UserMenu locale={locale} />
    </div>
  );
}
