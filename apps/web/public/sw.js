// v2: manifest moved from the static public/manifest.json to the
// app/manifest.ts file-convention route, served at /manifest.webmanifest
// instead - the old URL 404s now. cache.addAll() fails its entire
// install step if any single precached URL 404s, so this had to be
// updated here too, not just in layout.tsx's metadata.manifest
// reference. Cache name bumped so existing installed service workers
// re-precache with the corrected URL rather than keeping a stale list.
const CACHE_NAME = "instadrop-shell-v2";
const APP_SHELL_URLS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  // Navigations: network-first so users always get the latest app shell
  // when online, falling back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((cached) => cached || Response.error()))
    );
    return;
  }

  // Everything else (JS/CSS chunks, icons): cache-first, populate the
  // cache as assets are fetched so repeat/offline visits are instant.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
