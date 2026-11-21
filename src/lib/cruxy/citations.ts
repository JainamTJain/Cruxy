
import { logActivity } from "@/lib/db/repository";
import type { CitedClaim } from "@/lib/cruxy/schemas/common";

export type CitationSource = {
  id: string;
  text: string;
  kind?: "passage" | "transcript_line" | "truth_item" | "other";
};

export type CitationFailure = {
  claimText: string;
  reason:
    | "missing_id"
    | "unknown_id"
    | "quote_not_found"
    | "no_citations"
    | "empty_claim";
  citationIds: string[];
  quote?: string | null;
};

export type CitationCheckResult<T extends { claims?: CitedClaim[] }> = {
  ok: boolean;
  data: T;
  dropped: CitedClaim[];
  failures: CitationFailure[];
};

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when `quote` appears in `sourceText` (whitespace-insensitive substring). */
export function quoteAppearsInSource(
  quote: string,
  sourceText: string,
): boolean {
  const q = normalize(quote);
  if (!q) return false;
  return normalize(sourceText).includes(q);
}

/**
 * Server check: every cited id exists, and every quoted string appears in the
 * cited text. Failures are dropped (no citation, no display) and logged.
 */
export function validateCitedClaims(
  claims: CitedClaim[],
  sources: CitationSource[],
): { kept: CitedClaim[]; dropped: CitedClaim[]; failures: CitationFailure[] } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const kept: CitedClaim[] = [];
  const dropped: CitedClaim[] = [];
  const failures: CitationFailure[] = [];

  for (const claim of claims) {
    const text = (claim.text ?? "").trim();
    if (!text) {
      failures.push({
        claimText: "",
        reason: "empty_claim",
        citationIds: claim.citation_ids ?? [],
      });
      dropped.push(claim);
      continue;
    }

    const ids = (claim.citation_ids ?? []).filter(Boolean);
    if (ids.length === 0) {
      failures.push({
        claimText: text,
        reason: "no_citations",
        citationIds: [],
        quote: claim.quote,
      });
      dropped.push(claim);
      continue;
    }

    let bad = false;
    for (const id of ids) {
      const src = byId.get(id);
      if (!src) {
        failures.push({
          claimText: text,
          reason: "unknown_id",
          citationIds: ids,
          quote: claim.quote,
        });
        bad = true;
        break;
      }
    }
    if (bad) {
      dropped.push(claim);
      continue;
    }

    const quote = (claim.quote ?? "").trim();
    if (quote) {
      const found = ids.some((id) => {
        const src = byId.get(id)!;
        return quoteAppearsInSource(quote, src.text);
      });
      if (!found) {
        failures.push({
          claimText: text,
          reason: "quote_not_found",
          citationIds: ids,
          quote,
        });
        dropped.push(claim);
        continue;
      }
    }

    kept.push({ ...claim, citation_ids: ids, text });
  }

  return { kept, dropped, failures };
}

/**
 * Apply citation guard to a structured agent payload that has a `claims` array.
 * Invalid claims are removed; caller should hide any display that depended on them.
 */
export function applyCitationGuard<T extends { claims?: CitedClaim[] }>(
  data: T,
  sources: CitationSource[],
): CitationCheckResult<T> {
  const claims = data.claims ?? [];
  const { kept, dropped, failures } = validateCitedClaims(claims, sources);
  return {
    ok: failures.length === 0,
    data: { ...data, claims: kept },
    dropped,
    failures,
  };
}

/**
 * Judge scores: drop any score whose evidence quotes fail the citation check.
 * Spec: any score without evidence is not shown.
 */
export function filterScoresByEvidence<
  T extends {
    evidence: Array<{ line_id: string; quote: string }>;
  },
>(
  scores: T[],
  sources: CitationSource[],
): { kept: T[]; dropped: T[]; failures: CitationFailure[] } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const kept: T[] = [];
  const dropped: T[] = [];
  const failures: CitationFailure[] = [];

  for (const score of scores) {
    const evidence = score.evidence ?? [];
    if (evidence.length === 0) {
      failures.push({
        claimText: "score",
        reason: "no_citations",
        citationIds: [],
      });
      dropped.push(score);
      continue;
    }
    let ok = true;
    for (const ev of evidence) {
      const src = byId.get(ev.line_id);
      if (!src) {
        failures.push({
          claimText: "score",
          reason: "unknown_id",
          citationIds: [ev.line_id],
          quote: ev.quote,
        });
        ok = false;
        break;
      }
      if (ev.quote && !quoteAppearsInSource(ev.quote, src.text)) {
        failures.push({
          claimText: "score",
          reason: "quote_not_found",
          citationIds: [ev.line_id],
          quote: ev.quote,
        });
        ok = false;
        break;
      }
    }
    if (ok) kept.push(score);
    else dropped.push(score);
  }

  return { kept, dropped, failures };
}

/** Log citation failures to activity_log (never log full prompts or secrets). */
export async function logCitationFailures(input: {
  feature: string;
  personId?: string | null;
  failures: CitationFailure[];
}): Promise<void> {
  if (input.failures.length === 0) return;
  await logActivity({
    person_id: input.personId ?? null,
    action: "citation_check_failed",
    target: input.feature,
    meta: {
      count: input.failures.length,
      reasons: input.failures.map((f) => f.reason),
      // Truncate claim text; never store long quotes.
      samples: input.failures.slice(0, 5).map((f) => ({
        reason: f.reason,
        ids: f.citationIds.slice(0, 4),
        claim: f.claimText.slice(0, 80),
      })),
    },
  });
}

/**
 * Parse citation-bearing JSON from model text. Returns null if not JSON.
 * Used by the callCruxy citation hook.
 */
export function tryParseClaimsPayload(
  text: string,
): { claims: CitedClaim[] } | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      claims?: CitedClaim[];
    };
    if (!Array.isArray(parsed.claims)) return null;
    return { claims: parsed.claims };
  } catch {
    return null;
  }
}
