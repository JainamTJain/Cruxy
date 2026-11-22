"use client";

/** Register the Crux service worker once on the client. */
export function registerCruxServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const onLoad = () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        /* Offline is best-effort; ignore registration failures. */
      });
  };
  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });
}
