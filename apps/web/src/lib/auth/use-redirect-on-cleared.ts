"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "./store";

/**
 * Watches the auth store and, once bootstrap has settled, pushes the user to
 * /{locale}/login?returnTo=... if they no longer have an access token. This
 * is the mid-session recovery path — server-side `requireAuth` only runs on
 * first render, so without this hook a `clearAuth()` triggered by a 401
 * (genuine expiry, manually-cleared cookie, revoked refresh) would leave the
 * user stranded on a broken page.
 *
 * Auth routes are excluded so we don't loop when the user is *meant* to be
 * unauthenticated (login, signup, password reset, email verification).
 */
export function useRedirectOnAuthCleared(locale: string): void {
  const router = useRouter();
  const path = usePathname();
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!bootstrapped) return;
    if (token) return;
    if (!path) return;

    const prefix = `/${locale}/`;
    const sub = path.startsWith(prefix) ? path.slice(prefix.length) : path;
    const authRoots = [
      "login",
      "signup",
      "forgot-password",
      "reset-password",
      "verify-email",
      "impersonation-handoff",
    ];
    if (authRoots.some((r) => sub === r || sub.startsWith(`${r}/`) || sub.startsWith(`${r}?`))) {
      return;
    }

    const returnTo = encodeURIComponent(path);
    router.replace(`/${locale}/login?returnTo=${returnTo}`);
  }, [bootstrapped, token, path, locale, router]);
}
