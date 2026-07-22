"use client";
import { useEffect, type ReactNode } from "react";
import { useAdminAuthStore } from "./store";
import { refreshAdminSession } from "../api/client";

/**
 * On mount: if there's no in-memory access token but the browser holds the
 * madar_admin_refresh cookie, exchange it for a fresh access token. The
 * cookie is HttpOnly so the client can only trigger the exchange — not read
 * the token directly.
 *
 * The exchange MUST go through the shared single-flight refreshAdminSession:
 * child effects run before this parent effect, so page queries may already
 * have started the same exchange. A second parallel refresh with the same
 * cookie trips the API's rotation replay detection and revokes the whole
 * token family (the "session dies on hard reload" bug).
 */
export function AdminAuthBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { accessToken, bootstrapped, setBootstrapped } = useAdminAuthStore.getState();
    if (bootstrapped || accessToken) return;

    void (async () => {
      const ok = await refreshAdminSession();
      // Success sets the store (and bootstrapped) inside refreshAdminSession;
      // on failure mark bootstrap done so redirect-to-login logic proceeds.
      if (!ok) setBootstrapped();
    })();
  }, []);

  return <>{children}</>;
}
