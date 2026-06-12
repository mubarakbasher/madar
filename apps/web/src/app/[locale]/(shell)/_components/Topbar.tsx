"use client";

import { useEffect, useState } from "react";
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

/**
 * Today's date for the dashboard crumb, e.g. "Mon · 8 Jun 2026".
 * Formatted in an effect so the server (its own timezone) and the browser
 * never disagree during hydration — the sub appears client-side only.
 */
function useTodaySub(locale: string): string {
  const [sub, setSub] = useState("");
  useEffect(() => {
    const tag = locale === "ar" ? "ar-EG" : "en-GB";
    const now = new Date();
    const weekday = new Intl.DateTimeFormat(tag, { weekday: "short" }).format(now);
    const date = new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(now);
    setSub(`${weekday} · ${date}`);
  }, [locale]);
  return sub;
}

export function Topbar({ locale }: { locale: string }) {
  const tShell = useTranslations("shell");
  const tBar = useTranslations("shell.topbar");
  const tCrumb = useTranslations("shell.crumb");
  const pathname = usePathname();
  const key = crumbKeyFor(pathname);
  const todaySub = useTodaySub(locale);
  const crumb = key ? tCrumb(key) : tShell("brand");
  const sub = key === "dashboard" ? todaySub : key ? tCrumb(`${key}Sub`) : "";

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
