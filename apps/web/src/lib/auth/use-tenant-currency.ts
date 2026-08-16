"use client";

import { useAuthStore } from "./store";

/**
 * The tenant's default currency, read reactively.
 *
 * Two bugs made this worth centralising:
 *
 *  - the fallback was split across the app — twelve call sites said "USD" and
 *    eight said "EGP", for a product whose signup default, seed and docs are
 *    all EGP. An EGP tenant priced its P&L in dollars and got a zero
 *    statement, because the currency filter excluded every real sale.
 *  - six call sites read `useAuthStore.getState()` inside a component. That is
 *    a one-shot read: `tenant` is null for the whole first render, so those
 *    components captured the fallback and never re-rendered when the session
 *    arrived.
 *
 * Prefer gating on `bootstrapped` too wherever the value feeds a query key —
 * otherwise the first request goes out under the fallback and the corrected
 * one is a second round-trip.
 */
export const FALLBACK_CURRENCY = "EGP";

export function useTenantCurrency(): string {
  return useAuthStore((s) => s.tenant?.default_currency_code ?? FALLBACK_CURRENCY);
}
