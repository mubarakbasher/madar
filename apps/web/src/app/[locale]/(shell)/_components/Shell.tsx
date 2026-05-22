"use client";

import "./_shell.css";
import { useRedirectOnAuthCleared } from "@/lib/auth/use-redirect-on-cleared";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { Sidebar } from "./Sidebar";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { Topbar } from "./Topbar";

export function Shell({ locale, children }: { locale: string; children: React.ReactNode }) {
  // Mid-session recovery: if any apiFetch confirms the refresh token expired
  // and clears the store, push to /login?returnTo=…  instead of leaving the
  // user staring at a half-broken page.
  useRedirectOnAuthCleared(locale);

  return (
    <div className="app paper-tex">
      <ImpersonationBanner />
      <SubscriptionBanner />
      <Sidebar />
      <Topbar locale={locale} />
      <div className="content">{children}</div>
    </div>
  );
}
