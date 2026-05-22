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

// Singleton mutex — concurrent 401s share one /admin/auth/refresh call.
// Module-scoped to apps/admin only, so a tenant 401 cannot block this one
// and vice versa.
let inflightRefresh: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
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
    const refreshed = await tryRefresh();
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
