/* Crux web push service worker (Wave 9 J). Registered only after Turn on alerts. */
self.addEventListener("push", (event) => {
  let data = { title: "Crux", body: "", href: "/notifications", tag: "crux" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore
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
