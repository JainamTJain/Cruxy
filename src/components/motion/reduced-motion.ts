"use client";

import { useEffect, useState } from "react";

function systemPrefersReduce(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Honour Wave 9 I user override (data-reduce-motion) then the system setting. */
export function prefersReducedMotion(): boolean {
  if (typeof document !== "undefined") {
    const mode = document.documentElement.dataset.reduceMotion;
    if (mode === "on") return true;
    if (mode === "off") return false;
  }
  return systemPrefersReduce();
}

/** Live reduced-motion (system + saved display setting). Defaults false on the server. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const apply = () => setReduced(prefersReducedMotion());
    apply();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", apply);
    window.addEventListener("crux-access-prefs", apply);
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduce-motion"],
    });
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("crux-access-prefs", apply);
      obs.disconnect();
    };
  }, []);
  return reduced;
}
