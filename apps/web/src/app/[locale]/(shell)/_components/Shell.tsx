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

  // The banners live OUTSIDE `.app`. Inside it they were auto-placed by the
  // grid, and since .sidebar/.topbar/.content all claim named areas the only
  // free slot was an implicit row *after* them — so "account suspended" and
  // "you are impersonating" rendered at the very bottom of the page, below the
  // fold, where nobody saw them.
  //
  // They are deliberately not sticky: .sidebar and .topbar are sticky to the
  // viewport top, so a sticky banner would sit on top of the topbar. Pinning
  // the banner permanently needs the shell to move to an inner scroll
  // container — tracked as a follow-up.
  return (
    <>
      <div className="app-banners">
        <ImpersonationBanner />
        <SubscriptionBanner />
      </div>
      <div className="app paper-tex">
        <Sidebar />
        <Topbar locale={locale} />
        <div className="content">{children}</div>
      </div>
    </>
  );
}
