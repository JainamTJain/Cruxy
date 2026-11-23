/**
 * Research as people read it: no ids in sentences, plain empty briefs.
 * Applied when research leaves the server, so stored runs read cleanly too.
 */
import { cleanReaderText } from "@/lib/text/reader-text";
import type {
  ClaimSourceDossier,
  RankedResearchSource,
  ResearchBrief,
  ResearchFinding,
} from "@/lib/library/types";

const NOTHING_YET =
  "Nothing new is strong enough yet. Cruxy checks again each night.";

function shortName(citation: string | null | undefined): string | null {
  const c = (citation ?? "").replace(/\s+/g, " ").trim();
  if (!c) return null;
  return c.length > 60 ? `${c.slice(0, 57).trim()}...` : c;
}

export function cleanResearchForReaders<
  R extends {
    findings: ResearchFinding[];
    claim_dossiers?: ClaimSourceDossier[] | null;
    brief?: ResearchBrief | null;
  },
>(run: R): R {
  const names = new Map<string, string>();
  for (const f of run.findings ?? []) {
    const n = shortName(f.citation);
    if (n) names.set(f.id.toLowerCase(), n);
  }
  const allSources = (d: ClaimSourceDossier): RankedResearchSource[] =>
    [d.best, ...d.top, d.steelman, ...d.more].filter(
      (s): s is RankedResearchSource => Boolean(s),
    );
  for (const d of run.claim_dossiers ?? []) {
    for (const s of allSources(d)) {
      const n = shortName(s.citation);
      if (n && s.finding_id) names.set(s.finding_id.toLowerCase(), n);
    }
  }
  const clean = (t: string) => cleanReaderText(t ?? "", names);
  const cleanSource = (s: RankedResearchSource | null) =>
    s
      ? { ...s, point: clean(s.point), why_place: clean(s.why_place) }
      : s;

  let brief = run.brief ?? null;
  if (brief) {
    const summary = clean(brief.summary);
    const empty =
      /threshold|clears? the|no finding|\d+-point/i.test(summary) ||
      !summary;
    brief = empty
      ? { ...brief, summary: NOTHING_YET, judgment_changes: "", judgment_does_not: "" }
      : {
          ...brief,
          summary,
          judgment_changes: clean(brief.judgment_changes),
          judgment_does_not: clean(brief.judgment_does_not),
        };
  }

  return {
    ...run,
    findings: (run.findings ?? []).map((f) => ({
      ...f,
      point: clean(f.point),
      why_it_matters: clean(f.why_it_matters),
    })),
    claim_dossiers: (run.claim_dossiers ?? null)?.map((d) => ({
      ...d,
      best: cleanSource(d.best),
      top: d.top.map((s) => cleanSource(s)!),
      steelman: cleanSource(d.steelman),
      more: d.more.map((s) => cleanSource(s)!),
    })) ?? null,
    brief,
  };
}
