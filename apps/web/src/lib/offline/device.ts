const DEVICE_UUID_KEY = "madar.device_uuid";
const SEQUENCE_KEY = "madar.client_sequence";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Stable per-browser device id. Created lazily on first call and persisted in
 * localStorage. SSR-safe: returns "" when there is no window.
 */
export function getDeviceUuid(): string {
  if (!hasWindow()) return "";
  const existing = window.localStorage.getItem(DEVICE_UUID_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_UUID_KEY, fresh);
  return fresh;
}

/**
 * Monotonic per-device sequence. Increments on every call. Single-tab safe;
 * multi-tab races are explicitly out of scope.
 *
 * Always writes the new value back BEFORE returning so a crash between the
 * read and the return cannot reuse the same number for two different sales.
 */
export function getNextSequence(): number {
  if (!hasWindow()) return 0;
  const raw = window.localStorage.getItem(SEQUENCE_KEY);
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
  const current = Number.isFinite(parsed) ? parsed : 0;
  const next = current + 1;
  window.localStorage.setItem(SEQUENCE_KEY, String(next));
  return next;
}
