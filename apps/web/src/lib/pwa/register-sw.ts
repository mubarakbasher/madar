// Idempotent service-worker registration. Safe to call from multiple
// effects; only the first call goes through.

let registered = false;

export function registerSw(): void {
  if (registered) return;
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  registered = true;

  void navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .catch((err) => {
      // Re-allow retry on next mount if registration failed.
      registered = false;
      // eslint-disable-next-line no-console
      console.warn("[madar] service worker registration failed:", err);
    });
}

const DISMISSED_KEY = "madar.install.dismissed";

export function markInstallDismissed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISSED_KEY, "1");
}

export function isInstallDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(DISMISSED_KEY) === "1";
}
