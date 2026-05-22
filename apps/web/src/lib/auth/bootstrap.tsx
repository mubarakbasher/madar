"use client";
import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "./store";
import { tryRefresh } from "../api/client";

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
    const { accessToken, bootstrapped, clearAuth, setBootstrapped } =
      useAuthStore.getState();
    if (bootstrapped || accessToken) return;

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
