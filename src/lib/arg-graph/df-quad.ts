/**
 * DF-QuAD style gradual semantics (Rago / Baroni et al.).
 * Computed in code only — never ask a model for the number.
 *
 * Aggregation σ(E) = 1 - ∏(1 - v(e))
 * Score φ(b, σ⁺, σ⁻) = b - b·σ⁻ + (1 - b)·σ⁺
 * Supporters raise the score; unanswered attacks lower it.
 */
import type { ArgEdge, ClaimRobustnessScore } from "@/lib/arg-graph/types";

const BASE = 0.5;

/** Product-based aggregation used by DF-QuAD (values in [0,1]). */
export function dfQuadAggregate(strengths: number[]): number {
  if (!strengths.length) return 0;
  let prod = 1;
  for (const s of strengths) {
    const clamped = Math.min(1, Math.max(0, s));
    prod *= 1 - clamped;
  }
  return 1 - prod;
}

export function dfQuadScore(input: {
  base?: number;
  supportStrengths: number[];
  unansweredAttackStrengths: number[];
}): number {
  const b = input.base ?? BASE;
  const plus = dfQuadAggregate(input.supportStrengths);
  const minus = dfQuadAggregate(input.unansweredAttackStrengths);
  const score = b - b * minus + (1 - b) * plus;
  return Math.min(1, Math.max(0, score));
}

function edgeStrength(e: ArgEdge): number {
  const w = Number(e.weight);
  if (!Number.isFinite(w) || w <= 0) return 0.5;
  return Math.min(1, Math.max(0.05, w));
}

/**
 * An attack on claim C is answered when there is a concedes / distinguishes /
 * rebuts edge whose to_id is the attacking node (or the attack edge id).
 */
export function isAttackAnswered(
  attack: ArgEdge,
  edges: ArgEdge[],
): boolean {
  const answerTypes = new Set(["concedes", "distinguishes", "rebuts"]);
  return edges.some((e) => {
    if (!answerTypes.has(e.type)) return false;
    if (e.to_id === attack.from_id) return true;
    if (e.to_id === attack.id) return true;
    if (e.source_id && e.source_id === attack.id) return true;
    return false;
  });
}

export function scoreClaimFromEdges(input: {
  claimId: string;
  teamId: string;
  caseId: string;
  edges: ArgEdge[];
}): ClaimRobustnessScore {
  const { claimId, teamId, caseId, edges } = input;

  const supports = edges.filter(
    (e) =>
      e.type === "supports" &&
      e.to_kind === "claim" &&
      e.to_id === claimId,
  );
  const attacks = edges.filter(
    (e) =>
      e.type === "attacks" &&
      e.to_kind === "claim" &&
      e.to_id === claimId,
  );

  const answered: ArgEdge[] = [];
  const open: ArgEdge[] = [];
  for (const a of attacks) {
    if (isAttackAnswered(a, edges)) answered.push(a);
    else open.push(a);
  }

  const supportStrengths = supports.map(edgeStrength);
  const unansweredAttackStrengths = open.map(edgeStrength);
  const score = dfQuadScore({
    supportStrengths,
    unansweredAttackStrengths,
  });

  const roundIds = [
    ...new Set(
      open
        .map((a) => a.round_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    claim_id: claimId,
    team_id: teamId,
    case_id: caseId,
    score,
    score_pct: Math.round(score * 100),
    attacks_answered: answered.length,
    attacks_open: open.length,
    open_from_rounds: roundIds,
    support_strength: dfQuadAggregate(supportStrengths),
    attack_strength: dfQuadAggregate(unansweredAttackStrengths),
  };
}

export function formatAttackSummary(row: ClaimRobustnessScore): string {
  if (row.attacks_answered === 0 && row.attacks_open === 0) {
    return "No attacks recorded yet.";
  }
  const roundPart =
    row.open_from_rounds.length > 0
      ? ` (from round ${row.open_from_rounds
          .map((id) => id.slice(0, 8))
          .join(", ")})`
      : "";
  return `${row.attacks_answered} attack${row.attacks_answered === 1 ? "" : "s"} answered, ${row.attacks_open} open${row.attacks_open ? roundPart : ""}`;
}
