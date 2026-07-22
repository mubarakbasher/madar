"use client";
import { useAdminAuthStore, type AdminUser } from "../auth/store";

const API_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

interface FetchOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip the 401 refresh+retry dance (used by /refresh itself to avoid loops). */
  noRetryOn401?: boolean;
}

// Singleton mutex — ALL refresh attempts (401 retries, the boot-time gate
// below, and AdminAuthBootstrap) share one /admin/auth/refresh call. Two
// parallel refreshes with the same cookie would trip the API's rotation
// replay detection and revoke the whole token family, killing the session
// on every hard reload. Module-scoped to apps/admin only, so a tenant 401
// cannot block this one and vice versa.
let inflightRefresh: Promise<boolean> | null = null;

export async function refreshAdminSession(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        access_token: string;
        platform_user: AdminUser;
      };
      useAdminAuthStore.getState().setAuth({
        accessToken: data.access_token,
        user: data.platform_user,
      });
      return true;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

export async function adminApiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { body, headers = {}, noRetryOn401, ...rest } = opts;
  const method = (rest.method ?? "GET").toUpperCase();

  const finalHeaders: Record<string, string> = { Accept: "application/json", ...headers };
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }

  // Boot-time gate: on a hard reload the page's queries mount before the
  // session is restored. Instead of firing tokenless requests that 401 and
  // then retry, wait for the (single-flight) cookie exchange first. After
  // the first attempt resolves, `bootstrapped` is true and this never runs
  // again.
  {
    const state = useAdminAuthStore.getState();
    if (
      !state.accessToken &&
      !state.bootstrapped &&
      !noRetryOn401 &&
      path !== "/v1/admin/auth/refresh"
    ) {
      await refreshAdminSession();
    }
  }

  const token = useAdminAuthStore.getState().accessToken;
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
  if (res.status === 401 && !noRetryOn401 && path !== "/v1/admin/auth/refresh") {
    const refreshed = await refreshAdminSession();
    if (refreshed) {
      const next = useAdminAuthStore.getState().accessToken;
      if (next) finalHeaders.Authorization = `Bearer ${next}`;
      res = await doFetch();
    } else {
      useAdminAuthStore.getState().clearAuth();
    }
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
    );
  }
  return (data as T) ?? (null as T);
}
