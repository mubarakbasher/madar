import type { CookieOptions } from "express";
import { loadEnv } from "../env";

/**
 * Cookie attributes for refresh-token cookies.
 *
 * Domain handling: when COOKIE_DOMAIN is set to a real value (e.g. `.madarpos.com`),
 * it's emitted as the cookie's `Domain` attribute so the cookie is visible to every
 * subdomain — required when the api lives at `api.example.com` but the Next.js SSR
 * gates run at `admin.example.com` / `shop.example.com` and need to read the cookie.
 * When COOKIE_DOMAIN is `localhost` (the dev default), no Domain attribute is set so
 * the cookie defaults to host-only scoping, which is what browsers want for localhost.
 *
 * SameSite stays `lax` because the api + apps share a registrable domain
 * (same-site, different origin), and Lax permits same-site subresource fetches.
 */
export function refreshCookieOptions(maxAgeSec?: number): CookieOptions {
  const env = loadEnv();
  const isProd = env.NODE_ENV === "production";
  const hasRealDomain = env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    ...(hasRealDomain ? { domain: env.COOKIE_DOMAIN } : {}),
    ...(maxAgeSec !== undefined ? { maxAge: maxAgeSec * 1000 } : {}),
  };
}

/**
 * Options for `res.clearCookie`. Must match the `domain` + `path` that were set
 * originally, otherwise the browser keeps the cookie.
 */
export function clearCookieOptions(): CookieOptions {
  const env = loadEnv();
  const hasRealDomain = env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost";
  return {
    path: "/",
    ...(hasRealDomain ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}
