/**
 * F-099: deduplicate research findings against the library and yesterday.
 */
import type { ResearchFinding } from "@/lib/library/types";

function normLink(link: string): string {
  try {
    const u = new URL(link.trim());
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return link.trim().toLowerCase();
  }
}

function normPoint(point: string): string {
  return point
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 12)
    .join(" ");
}

function similarPoints(a: string, b: string): boolean {
  const wa = new Set(normPoint(a).split(" ").filter(Boolean));
  const wb = new Set(normPoint(b).split(" ").filter(Boolean));
  if (!wa.size || !wb.size) return false;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap += 1;
  const denom = Math.min(wa.size, wb.size);
  return overlap / denom >= 0.7;
}

export function dedupeFindings(input: {
  findings: ResearchFinding[];
  /** Prior findings (yesterday / earlier runs) for this case. */
  priorFindings: ResearchFinding[];
  /** Library passage snippets or file names to skip against. */
  libraryTexts: string[];
}): { kept: ResearchFinding[]; skipped: number } {
  const seenLinks = new Set(
    input.priorFindings.map((f) => normLink(f.link)).filter(Boolean),
  );
  const seenPoints = input.priorFindings.map((f) => f.point);
  const libNorm = input.libraryTexts.map((t) => normPoint(t)).filter(Boolean);

  const kept: ResearchFinding[] = [];
  let skipped = 0;

  for (const f of input.findings) {
    const link = normLink(f.link);
    if (link && seenLinks.has(link)) {
      skipped += 1;
      continue;
    }
    if (seenPoints.some((p) => similarPoints(p, f.point))) {
      skipped += 1;
      continue;
    }
    if (libNorm.some((t) => similarPoints(t, f.point))) {
      skipped += 1;
      continue;
    }
    if (link) seenLinks.add(link);
    seenPoints.push(f.point);
    kept.push(f);
  }

  return { kept, skipped };
}
