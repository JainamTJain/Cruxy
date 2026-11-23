/* Crux offline service worker (Wave 9 F).
 * Cache shell + offline pack API + C's competition/timer routes when present.
 */
// Bump on any change here so every browser drops the old cache.
const VERSION = "crux-offline-v3";
const SHELL = [
  "/",
  "/today",
  "/regional",
  "/calm",
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
    url.pathname.startsWith("/api/regional") ||
    url.pathname.startsWith("/api/calm/") ||
    // Legacy path name kept for older packs
    url.pathname.startsWith("/api/competition/") ||
    url.pathname.startsWith("/api/practice/rounds/")
  );
}

function isAppNavigation(request, url) {
  return (
    request.mode === "navigate" ||
    url.pathname.startsWith("/case-brain") ||
    url.pathname.startsWith("/regional") ||
    url.pathname.startsWith("/calm") ||
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

  // Pages: always try the network first so a new deploy shows at once;
  // the cached copy is only for when the phone is offline.
  if (isAppNavigation(req, url)) {
    event.respondWith(networkFirstPage(req));
    return;
  }
  // Built files have content hashes in their names, so a cached copy is never stale.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
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

async function networkFirstPage(req) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const shell = await cache.match("/today");
    return shell ?? Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}


/* Wave 9 J: web push (same worker as offline so scopes do not fight). */
self.addEventListener("push", (event) => {
  let data = { title: "Crux", body: "", href: "/notifications", tag: "crux" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore bad payloads
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Crux", {
      body: data.body || "",
      tag: data.tag || "crux",
      data: { href: data.href || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href =
    (event.notification.data && event.notification.data.href) ||
    "/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(href);
    }),
  );
});
