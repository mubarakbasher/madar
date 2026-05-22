// Madar service worker — lean hand-written, no Workbox.
// Strategy: cache-first for static + POS shell; network-first for everything
// else with offline-page fallback for navigations.

const CACHE = "madar-shell-v1";
const SHELL_PATHS = [
  "/en/pos",
  "/ar/pos",
  "/en/offline",
  "/ar/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Best-effort precache — skip any that 404 instead of failing install.
      await Promise.all(
        SHELL_PATHS.map((path) =>
          fetch(path, { credentials: "same-origin" })
            .then((res) => (res.ok ? cache.put(path, res) : null))
            .catch(() => null),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isSameOriginGet(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

function localeFromUrl(url) {
  const m = url.pathname.match(/^\/([a-z]{2})\//);
  return m ? m[1] : "en";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isSameOriginGet(request)) return;
  const url = new URL(request.url);

  // Don't intercept API calls — TanStack Query + the offline-aware dispatch
  // layer handles those.
  if (url.pathname.startsWith("/v1/")) return;
  // Skip Next.js dev-time module HMR — stale modules would break hot reload.
  if (url.pathname.startsWith("/_next/static/development/")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Cache-first for hashed build assets — safe because the hash changes on rebuild.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cache-first for the POS shell + offline page.
  if (
    url.pathname === "/en/pos" ||
    url.pathname === "/ar/pos" ||
    url.pathname === "/en/offline" ||
    url.pathname === "/ar/offline" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for everything else, with offline-page fallback for navigations.
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in background; don't await.
    fetch(request)
      .then((res) => {
        if (res.ok) cache.put(request, res.clone());
      })
      .catch(() => null);
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    return res;
  } catch (err) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const url = new URL(request.url);
      const fallback = await cache.match(`/${localeFromUrl(url)}/offline`);
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
