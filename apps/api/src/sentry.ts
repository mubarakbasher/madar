import * as Sentry from "@sentry/node";
import { loadEnv } from "./env";

/**
 * Initialise the Sentry Node SDK. Safe to call multiple times — Sentry's init
 * is idempotent. No-op when `SENTRY_DSN_API` is empty so dev + CI runs don't
 * need a DSN.
 */
export function initSentry(): boolean {
  const env = loadEnv();
  if (!env.SENTRY_DSN_API) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN_API,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    tracesSampleRate: 0.1,
    release: process.env.npm_package_version,
  });
  return true;
}
