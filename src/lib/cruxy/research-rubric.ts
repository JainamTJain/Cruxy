/**
 * Wave 8 H: written rubric for cogent research.
 * Cruxy weighs sources like an esteemed philosopher: few, ranked, judged.
 *
 * Dimensions (0..100 each):
 * - Relevance: fits the exact claim, not the case in general
 * - Argumentative force: how hard it pushes or blocks the claim
 * - Credibility: peer review, venue, citations, primary over secondary,
 *   recency where the fact changes
 */
import type { LiteratureHit } from "@/lib/cruxy/literature/types";
import type {
  ClaimSourceDossier,
  RankedResearchSource,
  ResearchFinding,
  RubricScores,
} from "@/lib/library/types";

export const RESEARCH_RUBRIC_TEXT = `Rank sources with this rubric (0 to 100 each):
1. Relevance: does it speak to this exact claim, not just the case?
2. Argumentative force: how strongly does it support or undercut the claim?
3. Credibility: peer reviewed when it should be, strong venue, cited when that helps, primary over secondary, recent when the fact changes.

A source clears the bar when its composite (equal weights) is at least 70.
Per claim keep at most 3 supporting sources. Pick the strongest opposing source as the steelman. Everything else goes under More.`;

/** Composite clears the bar for display as a top source or a material request. */
export const RUBRIC_BAR = 70;

export function rubricComposite(scores: RubricScores): number {
  return Math.round(
    (scores.relevance + scores.argumentative_force + scores.credibility) / 3,
  );
}

export function clearsRubricBar(scores: RubricScores): boolean {
  return rubricComposite(scores) >= RUBRIC_BAR;
}

/** Credibility from bibliographic signals (no model). */
export function credibilityFromSignals(input: {
  finding: Pick<
    ResearchFinding,
    "open_access" | "licence" | "year" | "doi" | "source_ids" | "verified"
  >;
  lit?: LiteratureHit | null;
  claimIsChangingFact?: boolean;
}): number {
  let score = 45;
  const sources = new Set([
    ...(input.finding.source_ids ?? []),
    ...(input.lit ? [input.lit.source] : []),
  ]);

  if (sources.has("pubmed_central") || sources.has("doaj")) score += 18;
  if (sources.has("openalex") || sources.has("semantic_scholar")) score += 14;
  if (sources.has("philpapers") || sources.has("crossref")) score += 12;
  if (sources.has("arxiv")) score += 8;
  if (sources.has("unpaywall")) score += 6;
  if (sources.has("web")) score += 2;

  if (input.finding.doi || input.lit?.doi) score += 8;
  if (input.finding.verified) score += 6;
  if (input.finding.open_access || input.lit?.open_access) score += 4;
  if (input.lit?.is_book) score -= 8;

  const year = input.finding.year ?? input.lit?.year ?? null;
  if (input.claimIsChangingFact && year) {
    const age = new Date().getFullYear() - year;
    if (age <= 2) score += 10;
    else if (age <= 5) score += 4;
    else if (age > 10) score -= 10;
  } else if (year && year < 1990) {
    // Classics still fine for frameworks; mild boost for longevity.
    score += 4;
  }

  return Math.min(100, Math.max(0, score));
}

/** Cheap relevance proxy when the model does not score a candidate. */
export function relevanceHeuristic(
  claimRef: string,
  text: string,
): number {
  const claimBits = claimRef
    .toLowerCase()
    .replace(/case\s+\d+/g, "")
    .replace(/claim\s+\d+/g, "")
    .replace(/support\s+\d+/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  if (!claimBits.length) return 55;
  const hay = text.toLowerCase();
  let hits = 0;
  for (const w of claimBits) {
    if (hay.includes(w)) hits += 1;
  }
  const ratio = hits / claimBits.length;
  return Math.min(100, Math.round(40 + ratio * 60));
}

export function scoreFindingAgainstClaim(input: {
  claimRef: string;
  finding: ResearchFinding;
  lit?: LiteratureHit | null;
  modelScores?: Partial<RubricScores> | null;
  opposing?: boolean;
}): RubricScores {
  const blob = [
    input.finding.point,
    input.finding.why_it_matters,
    input.finding.title ?? "",
    input.finding.quote,
  ].join(" ");
  const relevance =
    input.modelScores?.relevance ??
    relevanceHeuristic(input.claimRef, blob);
  const argumentative_force =
    input.modelScores?.argumentative_force ??
    Math.min(
      100,
      Math.round(
        50 +
          (input.finding.verified ? 15 : 0) +
          Math.min(20, input.finding.point.split(/\s+/).length) +
          (input.opposing ? 5 : 0),
      ),
    );
  const credibility =
    input.modelScores?.credibility ??
    credibilityFromSignals({
      finding: input.finding,
      lit: input.lit,
    });
  return {
    relevance: clampScore(relevance),
    argumentative_force: clampScore(argumentative_force),
    credibility: clampScore(credibility),
  };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function toRanked(
  finding: ResearchFinding,
  scores: RubricScores,
  why: string,
  role: RankedResearchSource["role"],
  rank: number | null,
): RankedResearchSource {
  return {
    finding_id: finding.id,
    title: finding.title ?? finding.point.slice(0, 80),
    authors: finding.authors ?? [],
    year: finding.year ?? null,
    url: finding.link,
    doi: finding.doi ?? null,
    citation: finding.citation ?? finding.link,
    open_access: finding.open_access ?? null,
    licence: finding.licence ?? null,
    point: finding.point,
    quote: finding.quote,
    verified: finding.verified,
    needs_check: finding.needs_check,
    rubric: scores,
    composite: rubricComposite(scores),
    why_place: why.slice(0, 220),
    role,
    rank,
  };
}

/**
 * Build per-claim dossiers: top 3 supports, one steelman, rest under More.
 * Only sources that clear the bar enter the top 3 / steelman slots.
 */
export function buildClaimDossiers(input: {
  findings: ResearchFinding[];
  litByFindingId?: Record<string, LiteratureHit | null>;
  modelRanks?: Array<{
    finding_id: string;
    claim_ref: string;
    role: "support" | "steelman" | "more";
    why_place: string;
    scores?: Partial<RubricScores>;
  }>;
}): ClaimSourceDossier[] {
  const byClaim = new Map<string, ResearchFinding[]>();
  for (const f of input.findings) {
    const key = f.claim_ref || "Case";
    const list = byClaim.get(key) ?? [];
    list.push(f);
    byClaim.set(key, list);
  }

  const dossiers: ClaimSourceDossier[] = [];
  for (const [claimRef, list] of byClaim) {
    const scored = list.map((f) => {
      const model = input.modelRanks?.find(
        (m) => m.finding_id === f.id || (m.claim_ref === claimRef && !m.finding_id),
      );
      const opposing =
        model?.role === "steelman" ||
        /\b(counter|oppose|against|objection|steelman)\b/i.test(
          `${f.point} ${f.why_it_matters}`,
        );
      const scores = scoreFindingAgainstClaim({
        claimRef,
        finding: f,
        lit: input.litByFindingId?.[f.id],
        modelScores: model?.scores,
        opposing,
      });
      return { f, scores, model, opposing, composite: rubricComposite(scores) };
    });

    scored.sort((a, b) => b.composite - a.composite);

    const steelmanCandidate =
      scored.find((s) => s.model?.role === "steelman") ??
      scored.find((s) => s.opposing && clearsRubricBar(s.scores)) ??
      null;

    const supports = scored
      .filter((s) => s !== steelmanCandidate && !s.opposing)
      .filter((s) => clearsRubricBar(s.scores))
      .slice(0, 3);

    // If nothing cleared the bar, still show the single best as a thin dossier.
    const top =
      supports.length > 0
        ? supports
        : scored.filter((s) => s !== steelmanCandidate).slice(0, 1);

    const topIds = new Set(top.map((s) => s.f.id));
    if (steelmanCandidate) topIds.add(steelmanCandidate.f.id);

    const rankedSupports = top.map((s, i) =>
      toRanked(
        s.f,
        s.scores,
        s.model?.why_place ??
          defaultWhy(s.scores, i === 0 ? "best" : "support"),
        "support",
        (i + 1) as 1 | 2 | 3,
      ),
    );

    const steelman = steelmanCandidate
      ? toRanked(
          steelmanCandidate.f,
          steelmanCandidate.scores,
          steelmanCandidate.model?.why_place ??
            defaultWhy(steelmanCandidate.scores, "steelman"),
          "steelman",
          null,
        )
      : null;

    const more = scored
      .filter((s) => !topIds.has(s.f.id))
      .map((s) =>
        toRanked(
          s.f,
          s.scores,
          s.model?.why_place ?? defaultWhy(s.scores, "more"),
          "more",
          null,
        ),
      );

    dossiers.push({
      claim_ref: claimRef,
      best: rankedSupports[0] ?? null,
      top: rankedSupports,
      steelman,
      more,
    });
  }

  return dossiers.sort((a, b) => a.claim_ref.localeCompare(b.claim_ref));
}

function defaultWhy(
  scores: RubricScores,
  kind: "best" | "support" | "steelman" | "more",
): string {
  const c = rubricComposite(scores);
  if (kind === "best") {
    return `Best fit for this claim (score ${c}): strong relevance and credibility.`;
  }
  if (kind === "steelman") {
    return `Strongest opposing line (score ${c}): force us to answer it squarely.`;
  }
  if (kind === "more") {
    return `Useful but below the top three (score ${c}).`;
  }
  return `Earns a place on force and credibility (score ${c}).`;
}

/** Pick at most `limit` findings for tonight's brief (highest composite first). */
export function selectNightlyFindings(
  findings: ResearchFinding[],
  dossiers: ClaimSourceDossier[],
  limit = 3,
): ResearchFinding[] {
  const scoreById = new Map<string, number>();
  for (const d of dossiers) {
    for (const s of [...d.top, ...(d.steelman ? [d.steelman] : [])]) {
      if (s.finding_id) scoreById.set(s.finding_id, s.composite);
    }
  }
  return [...findings]
    .sort(
      (a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0),
    )
    .slice(0, limit);
}
