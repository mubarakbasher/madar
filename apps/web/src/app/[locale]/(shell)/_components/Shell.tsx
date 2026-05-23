"use client";

import "./_shell.css";
import { useRedirectOnAuthCleared } from "@/lib/auth/use-redirect-on-cleared";
import { useRedirectOnNoPlan } from "@/lib/auth/use-redirect-on-no-plan";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { Sidebar } from "./Sidebar";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { Topbar } from "./Topbar";

export function Shell({ locale, children }: { locale: string; children: React.ReactNode }) {
  // Mid-session recovery: if any apiFetch confirms the refresh token expired
  // and clears the store, push to /login?returnTo=…  instead of leaving the
  // user staring at a half-broken page.
  useRedirectOnAuthCleared(locale);

  // Post-signup gate: tenants without a plan get bounced to the picker.
  // The API also returns 423 plan_required for any feature endpoint, so
  // this hook is just to avoid a blank dashboard before the API errors land.
  useRedirectOnNoPlan(locale);

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
