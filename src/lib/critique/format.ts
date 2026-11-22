/**
 * Compose rail copy that makes a case, then asks.
 */
import type { CritiqueFinding } from "@/lib/critique/types";

function scrub(s: string): string {
  return s.replace(/[·—–]/g, ",").replace(/\s+/g, " ").trim();
}

export function formatCritiqueText(f: CritiqueFinding): string {
  const parts = [
    `Where it is weak: ${scrub(f.weakSpot)}`,
    `Why: ${scrub(f.why)}`,
    f.fallacyName ? `Fallacy: ${scrub(f.fallacyName)}.` : null,
    `Stronger: ${scrub(f.stronger)}`,
    /what do you think\?/i.test(f.questionBack)
      ? scrub(f.questionBack)
      : `${scrub(f.questionBack).replace(/\?$/, "")}? What do you think?`,
  ].filter(Boolean);
  return parts.join(" ");
}

export const KIND_LABELS: Record<CritiqueFinding["kind"], string> = {
  missing_perspective: "Missing perspective",
  missing_stakeholder: "Missing stakeholder",
  unanswered_counter: "Unanswered counterargument",
  logical_fallacy: "Logical fallacy",
  disconnected_claim: "Claim does not connect",
  loose_end: "Loose end",
  evidence_gap: "Evidence gap",
  sharper_wording: "Sharper wording",
};
