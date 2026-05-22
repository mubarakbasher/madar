import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const REFRESH_COOKIE = "madar_refresh";

/**
 * Server-side auth guard. Redirects to /[locale]/login if the refresh cookie
 * is missing. Does NOT validate the cookie's signature — that happens when the
 * client-side bootstrap exchanges it for an access token via /v1/auth/refresh.
 *
 * The intent here is "fail fast for definitely-unauthenticated browsers" so
 * that protected layouts don't render their chrome only to immediately bounce.
 */
export function requireAuth(locale: string): void {
  const refresh = cookies().get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    redirect(`/${locale}/login`);
  }
}
