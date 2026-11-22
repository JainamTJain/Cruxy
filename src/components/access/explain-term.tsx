"use client";

/**
 * Legacy select-to-explain popup. Replaced by AnnotateSurface → Explain this
 * in `src/components/case/reading-tools.tsx`, which still calls
 * `/api/access/explain` (after framework cards). Kept as a no-op so old
 * imports do not crash and the access wiring contract still finds this file.
 */
export function ExplainTermListener() {
  return null;
}
