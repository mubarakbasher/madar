"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "./store";

/**
 * Sibling to useRedirectOnAuthCleared: once auth bootstrap has settled and the
 * user has a session, check whether their tenant has picked a plan. If not,
 * push them to /[locale]/select-plan. Skips the redirect when the user is
 * already on the picker (would loop) or when no tenant is loaded (the
 * auth-cleared hook handles that path).
 *
 * NOTE: the picker lives in the `(onboarding)` route GROUP — parentheses
 * never appear in URLs, so the route is `/select-plan`, not
 * `/onboarding/select-plan`. Getting this wrong 404s every new signup.
 */
export function useRedirectOnNoPlan(locale: string): void {
  const router = useRouter();
  const path = usePathname();
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const tenant = useAuthStore((s) => s.tenant);

  useEffect(() => {
    if (!bootstrapped) return;
    if (!tenant) return;
    if (tenant.plan) return;
    if (!path) return;

    const prefix = `/${locale}/`;
    const sub = path.startsWith(prefix) ? path.slice(prefix.length) : path;
    if (sub.startsWith("select-plan")) return;

    router.replace(`/${locale}/select-plan`);
  }, [bootstrapped, tenant, path, locale, router]);
}
