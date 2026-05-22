"use client";
import { useEffect, type ReactNode } from "react";
import { useAdminAuthStore } from "./store";
import { adminApiFetch } from "../api/client";
import type { AdminUser } from "./store";

/**
 * On mount: if there's no in-memory access token but the browser holds the
 * madar_admin_refresh cookie, exchange it for a fresh access token via
 * /v1/admin/auth/refresh. The cookie is HttpOnly so the client can only
 * trigger the exchange — not read the token directly.
 */
export function AdminAuthBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { accessToken, bootstrapped, setAuth, setBootstrapped } = useAdminAuthStore.getState();
    if (bootstrapped || accessToken) return;

    void (async () => {
      try {
        const session = await adminApiFetch<{
          access_token: string;
          platform_user: AdminUser;
        }>("/v1/admin/auth/refresh", { method: "POST", noRetryOn401: true });
        setAuth({
          accessToken: session.access_token,
          user: session.platform_user,
        });
      } catch {
        setBootstrapped();
      }
    })();
  }, []);

  return <>{children}</>;
}
