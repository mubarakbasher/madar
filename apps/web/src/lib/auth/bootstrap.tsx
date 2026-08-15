"use client";
import { useEffect, type ReactNode } from "react";
import { useAuthStore, type AuthTenant, type AuthUser } from "./store";
import { clearImpersonation, readImpersonation } from "./impersonation";
import { apiFetch, tryRefresh } from "../api/client";

/**
 * On mount, if we have no access token but the browser holds a refresh cookie,
 * exchange it for a session. Routes through the shared `tryRefresh` mutex in
 * `lib/api/client.ts` so a query that fires on the same tick dedupes with us
 * instead of issuing a second /v1/auth/refresh against an already-rotated
 * cookie (which the server would correctly reject as reuse-detected).
 *
 * Renders children immediately either way — gated pages either own a server
 * `requireAuth` redirect or watch `bootstrapped + !accessToken` via
 * `useRedirectOnAuthCleared`.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { accessToken, bootstrapped, clearAuth, setBootstrapped, setAuth } =
      useAuthStore.getState();
    if (bootstrapped || accessToken) return;

    // An impersonation session must win over the refresh cookie. The handoff
    // ends in a full page load, so by the time we run, the impersonation token
    // lives only in sessionStorage — while the browser may still hold the
    // target user's own `madar_refresh` cookie from an earlier login. Refreshing
    // first would silently swap the support session for that user's real one:
    // the banner would still show, but actions would no longer be attributed to
    // the impersonator and `/v1/impersonation/exit` would 400.
    const impersonation = readImpersonation();
    if (impersonation) {
      void (async () => {
        try {
          // Explicit Authorization + noRetryOn401: the store is empty, so the
          // cold-start guard in apiFetch would otherwise run the very refresh
          // we are avoiding here.
          const me = await apiFetch<{ user: AuthUser; tenant: AuthTenant }>("/v1/auth/me", {
            headers: { Authorization: `Bearer ${impersonation.access_token}` },
            noRetryOn401: true,
          });
          setAuth({
            accessToken: impersonation.access_token,
            user: me.user,
            tenant: me.tenant,
          });
        } catch {
          // Token expired or was revoked from the admin side — drop the stale
          // session rather than leaving a banner over a non-impersonated page.
          clearImpersonation();
          setBootstrapped();
        }
      })();
      return;
    }

    void (async () => {
      const result = await tryRefresh();
      if (result === "expired") {
        clearAuth();
      } else if (result === "network_error") {
        // Don't block the rest of the app forever — flip the bootstrap flag so
        // gated pages can either render or trigger their redirect. A fresh
        // /v1/auth/refresh will happen on the next 401 anyway.
        setBootstrapped();
      }
      // "ok": tryRefresh already wrote setAuth() which sets bootstrapped=true.
    })();
  }, []);

  return <>{children}</>;
}
