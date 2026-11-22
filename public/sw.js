/* Crux offline service worker (Wave 9 F).
 * Cache shell + offline pack API + C's competition/timer routes when present.
 */
const VERSION = "crux-offline-v1";
const SHELL = [
  "/",
  "/today",
  "/case-brain",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/cruxy/cruxy-lamp.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isOfflineApi(url) {
  return (
    url.pathname.startsWith("/api/offline/") ||
    url.pathname.startsWith("/api/case-home/") ||
    url.pathname.startsWith("/api/case-brain/") ||
    url.pathname.startsWith("/api/revision/") ||
    // C Wave 9 competition day / timer (cache when those routes land)
    url.pathname.startsWith("/api/competition/") ||
    url.pathname.startsWith("/api/practice/rounds/")
  );
}

function isAppNavigation(request, url) {
  return (
    request.mode === "navigate" ||
    url.pathname.startsWith("/case-brain") ||
    url.pathname.startsWith("/competition") ||
    url.pathname.startsWith("/practice/rounds") ||
    url.pathname.startsWith("/today")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isOfflineApi(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isAppNavigation(req, url) || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Offline and not saved." }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}
