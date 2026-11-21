import type { ClaimMapBody, ClaimMapVersion } from "@/lib/team/types";

export type ClaimMapDiffLine = {
  path: string;
  before: string;
  after: string;
};

/** Field-level claim-map body diff for the case-brain version panel. */
export function diffClaimMapBodies(
  prev: ClaimMapBody | null | undefined,
  next: ClaimMapBody | null | undefined,
): ClaimMapDiffLine[] {
  if (!next) return [];
  if (!prev) {
    return [{ path: "(new)", before: "", after: "initial version" }];
  }
  const out: ClaimMapDiffLine[] = [];
  const n = Math.max(prev.claims.length, next.claims.length);
  for (let i = 0; i < n; i++) {
    const a = prev.claims[i];
    const b = next.claims[i];
    const label = `Claim ${i + 1}`;
    if ((a?.text ?? "") !== (b?.text ?? "")) {
      out.push({
        path: `${label} text`,
        before: a?.text ?? "",
        after: b?.text ?? "",
      });
    }
    if ((a?.logic_line ?? "") !== (b?.logic_line ?? "")) {
      out.push({
        path: `${label} logic`,
        before: a?.logic_line ?? "",
        after: b?.logic_line ?? "",
      });
    }
    const supports = Math.max(a?.supports.length ?? 0, b?.supports.length ?? 0);
    for (let j = 0; j < supports; j++) {
      const as = a?.supports[j]?.text ?? "";
      const bs = b?.supports[j]?.text ?? "";
      if (as !== bs) {
        out.push({
          path: `${label} S${j + 1}`,
          before: as,
          after: bs,
        });
      }
    }
    if ((a?.counterclaim_response ?? "") !== (b?.counterclaim_response ?? "")) {
      out.push({
        path: `${label} counterclaim answer`,
        before: a?.counterclaim_response ?? "",
        after: b?.counterclaim_response ?? "",
      });
    }
  }
  return out;
}

export function previousClaimMapVersion(
  versions: ClaimMapVersion[],
  currentId: string,
): ClaimMapVersion | null {
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  const idx = ordered.findIndex((v) => v.id === currentId);
  if (idx < 0) return ordered[1] ?? null;
  return ordered[idx + 1] ?? null;
}
