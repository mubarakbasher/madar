"use client";
import { useAuthStore } from "../auth/store";

const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

interface FetchOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  /** Skip the 401 refresh+retry dance (used by /refresh itself to avoid loops). */
  noRetryOn401?: boolean;
}

// Singleton mutex for refresh — multiple in-flight 401s share one /refresh call.
// AuthBootstrap also routes through this so its bootstrap call dedupes with any
// concurrent apiFetch retry; otherwise two simultaneous /v1/auth/refresh calls
// race and the second hits a reuse-detected 401 from refresh-token rotation.
//
// `expired` is the only result that should drop the session. `network_error`
// covers fetch-throws and non-401 failures (5xx, DNS hiccup, offline) — those
// shouldn't wipe a live session.
export type RefreshResult = "ok" | "expired" | "network_error";
let inflightRefresh: Promise<RefreshResult> | null = null;

export async function tryRefresh(): Promise<RefreshResult> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 401) return "expired";
      if (!res.ok) return "network_error";
      const data = (await res.json()) as {
        access_token: string;
        user: AuthUserShape;
        tenant: AuthTenantShape;
      };
      useAuthStore.getState().setAuth({
        accessToken: data.access_token,
        user: data.user,
        tenant: data.tenant,
      });
      return "ok";
    } catch {
      return "network_error";
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

interface AuthUserShape {
  id: string;
  email: string;
  name: string;
  role: string;
  locale: string;
  branch_id: string | null;
  email_verified: boolean;
  mfa_enabled: boolean;
}
interface AuthTenantShape {
  id: string;
  slug: string;
  name: string;
  default_locale: string;
  default_currency_code: string;
  country_code: string;
  status: string;
  trial_ends_at: string | null;
  default_tax_class_id: string | null;
  tax_inclusive_default: boolean;
  plan: { code: string; name_i18n: unknown } | null;
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { body, headers = {}, idempotencyKey, noRetryOn401, ...rest } = opts;
  const method = (rest.method ?? "GET").toUpperCase();

  const finalHeaders: Record<string, string> = { Accept: "application/json", ...headers };
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (method !== "GET" && method !== "HEAD") {
    const key = idempotencyKey ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : "");
    if (key) finalHeaders["Idempotency-Key"] = key;
  }

  // Cold-start safety net: if the store hasn't been bootstrapped yet AND we
  // don't already hold a token, proactively run the refresh (deduped via the
  // singleton inflightRefresh mutex) before issuing the request. Without this,
  // every protected query that mounts on the same tick as AuthBootstrap fires
  // without a Bearer, eats a 401, and *then* enters the retry path — a wasted
  // round-trip on every cold page load. The /v1/auth/refresh endpoint itself
  // and any explicit `noRetryOn401` caller skip this guard.
  let token = useAuthStore.getState().accessToken;
  if (
    !token &&
    !noRetryOn401 &&
    path !== "/v1/auth/refresh" &&
    !useAuthStore.getState().bootstrapped
  ) {
    await tryRefresh();
    token = useAuthStore.getState().accessToken;
  }
  if (token && !finalHeaders.Authorization) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      method,
      credentials: "include",
      headers: finalHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });

  let res = await doFetch();
  if (res.status === 401 && !noRetryOn401 && path !== "/v1/auth/refresh") {
    const result = await tryRefresh();
    if (result === "ok") {
      const next = useAuthStore.getState().accessToken;
      if (next) finalHeaders.Authorization = `Bearer ${next}`;
      res = await doFetch();
    } else if (result === "expired") {
      // Confirmed: refresh cookie is gone or revoked. Wipe in-memory state so
      // the redirect-on-clear watcher (lib/auth/use-redirect-on-cleared.ts)
      // bounces the user to /login.
      useAuthStore.getState().clearAuth();
    }
    // `network_error`: leave the session alone. The original 401 surfaces as
    // an ApiError so the calling component can show a transient error UI.
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const payload = (data ?? {}) as Partial<ApiErrorPayload>;
    throw new ApiError(
      res.status,
      payload.code ?? "unknown_error",
      payload.message ?? `Request failed (${res.status})`,
      payload.fields,
      payload.details,
    );
  }
  return (data as T) ?? (null as T);
}
