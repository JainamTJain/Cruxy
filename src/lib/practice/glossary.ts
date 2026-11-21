import { randomUUID } from "crypto";
import type { GlossaryTerm } from "@/lib/practice/types";
import { ROSTER } from "@/lib/constants";
import { nowIso } from "@/lib/utils";

/** Seed glossary terms for a case from known Ethics Bowl vocabulary + roster. */
export function buildCaseGlossary(opts: {
  caseId: string | null;
  caseTitle?: string | null;
  extraTerms?: string[];
}): GlossaryTerm[] {
  const base = [
    "Nozick",
    "Brandenburg",
    "Kalshi",
    "NAGPRA",
    "looksmaxxing",
    "APPE",
    "Ethics Bowl",
    "utilitarian",
    "deontology",
    "virtue ethics",
    "stakeholder",
    "counterclaim",
    ...ROSTER.team1,
    ...ROSTER.team2,
    ...ROSTER.team3,
    ROSTER.coach,
    "Team 1",
    "Team 2",
    "Team 3",
  ];
  if (opts.caseTitle) {
    for (const word of opts.caseTitle.split(/\s+/)) {
      if (word.length > 3) base.push(word.replace(/[^a-zA-Z'-]/g, ""));
    }
  }
  const terms = [...new Set([...base, ...(opts.extraTerms ?? [])].filter(Boolean))];
  const at = nowIso();
  return terms.map((term) => ({
    id: randomUUID(),
    case_id: opts.caseId,
    term,
    misheard: [],
    pronunciation: null,
    created_at: at,
  }));
}

/** Key terms payload for AssemblyAI / transcription. */
export function keyTermsForRound(
  glossary: GlossaryTerm[],
  presentNames: string[],
): string[] {
  const fromGlossary = glossary.map((g) => g.term);
  return [...new Set([...fromGlossary, ...presentNames])].slice(0, 100);
}

/**
 * Correction pass: replace known misheard forms with glossary terms.
 * Marks corrections; never invents meaning beyond glossary swaps.
 */
export function applyGlossaryCorrections(
  text: string,
  glossary: GlossaryTerm[],
): { text: string; corrections: { from: string; to: string }[] } {
  let out = text;
  const corrections: { from: string; to: string }[] = [];
  for (const g of glossary) {
    for (const bad of g.misheard) {
      if (!bad) continue;
      const re = new RegExp(`\\b${escapeRegExp(bad)}\\b`, "gi");
      if (re.test(out)) {
        out = out.replace(re, g.term);
        corrections.push({ from: bad, to: g.term });
      }
    }
  }
  return { text: out, corrections };
}

export function learnMisheard(
  glossary: GlossaryTerm[],
  correctTerm: string,
  misheardForm: string,
): GlossaryTerm[] {
  return glossary.map((g) => {
    if (g.term.toLowerCase() !== correctTerm.toLowerCase()) return g;
    if (g.misheard.some((m) => m.toLowerCase() === misheardForm.toLowerCase())) {
      return g;
    }
    return { ...g, misheard: [...g.misheard, misheardForm] };
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
