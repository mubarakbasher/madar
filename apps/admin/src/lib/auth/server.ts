import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_REFRESH_COOKIE = "madar_admin_refresh";

/**
 * Server-side gate. Redirects to /login if the admin refresh cookie is
 * missing. Does NOT validate the cookie's signature — that happens when the
 * client bootstrap exchanges it for an access token via POST
 * /v1/admin/auth/refresh. Intent: fail fast for definitely-unauthenticated
 * browsers so protected pages don't flash chrome only to bounce.
 */
export function requireAdminAuth(): void {
  const refresh = cookies().get(ADMIN_REFRESH_COOKIE)?.value;
  if (!refresh) {
    redirect("/login");
  }
}
