/**
 * DF-QuAD style gradual semantics (Rago / Baroni et al.).
 * Computed in code only. Never ask a model for the number.
 *
 * Aggregation σ(E) = 1 - ∏(1 - v(e))
 * Combination (DF-QuAD): if σ⁻ >= σ⁺ then b - b·(σ⁻ - σ⁺), else b + (1 - b)·(σ⁺ - σ⁻)
 *
 * Recursive: a support that is itself attacked contributes less strength.
 */
import type { ArgEdge, ArgNodeKind, ClaimRobustnessScore } from "@/lib/arg-graph/types";

const BASE = 0.5;
const MAX_DEPTH = 6;

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
  const score =
    minus >= plus ? b - b * (minus - plus) : b + (1 - b) * (plus - minus);
  return Math.min(1, Math.max(0, score));
}

function edgeWeight(e: ArgEdge): number {
  const w = Number(e.weight);
  if (!Number.isFinite(w) || w <= 0) return 1;
  return Math.min(1, w);
}

/**
 * An attack is answered when there is a concedes / distinguishes / rebuts
 * edge targeting the attacking node (or the attack edge id).
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

/**
 * Recursive gradual strength of a node. Supporters raise it; unanswered
 * attacks lower it. Cycles and depth caps fall back to the base score.
 */
export function recursiveNodeStrength(
  kind: ArgNodeKind | string,
  id: string,
  edges: ArgEdge[],
  depth = 0,
  visiting: Set<string> = new Set(),
): number {
  const key = `${kind}:${id}`;
  if (depth > MAX_DEPTH || visiting.has(key)) return BASE;
  const nextVisit = new Set(visiting);
  nextVisit.add(key);

  const supports = edges.filter(
    (e) => e.type === "supports" && e.to_kind === kind && e.to_id === id,
  );
  const attacks = edges.filter(
    (e) => e.type === "attacks" && e.to_kind === kind && e.to_id === id,
  );
  const open = attacks.filter((a) => !isAttackAnswered(a, edges));

  const supportStrengths = supports.map((e) => {
    const child = recursiveNodeStrength(
      e.from_kind,
      e.from_id,
      edges,
      depth + 1,
      nextVisit,
    );
    return Math.max(0.05, child * edgeWeight(e));
  });
  const unansweredAttackStrengths = open.map((e) => {
    const child = recursiveNodeStrength(
      e.from_kind,
      e.from_id,
      edges,
      depth + 1,
      nextVisit,
    );
    return Math.max(0.05, child * edgeWeight(e));
  });

  if (!supportStrengths.length && !unansweredAttackStrengths.length) {
    return BASE;
  }
  return dfQuadScore({
    base: BASE,
    supportStrengths,
    unansweredAttackStrengths,
  });
}

/** Strength contributed along an edge into a claim (recursive from source). */
export function edgeStrength(e: ArgEdge, edges: ArgEdge[]): number {
  const child = recursiveNodeStrength(e.from_kind, e.from_id, edges, 1);
  return Math.max(0.05, child * edgeWeight(e));
}

export function scoreClaimFromEdges(input: {
  claimId: string;
  teamId: string;
  caseId: string;
  edges: ArgEdge[];
  /** Optional map of round_id → display date label (e.g. 21 Nov). */
  roundDateLabels?: Record<string, string>;
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

  const supportStrengths = supports.map((e) => edgeStrength(e, edges));
  const unansweredAttackStrengths = open.map((e) => edgeStrength(e, edges));
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
  const open_from_round_dates = roundIds.map((id) => {
    const label = input.roundDateLabels?.[id];
    return label ?? id.slice(0, 8);
  });

  return {
    claim_id: claimId,
    team_id: teamId,
    case_id: caseId,
    score,
    score_pct: Math.round(score * 100),
    attacks_answered: answered.length,
    attacks_open: open.length,
    open_from_rounds: roundIds,
    open_from_round_dates,
    support_strength: dfQuadAggregate(supportStrengths),
    attack_strength: dfQuadAggregate(unansweredAttackStrengths),
  };
}

export function formatAttackSummary(row: ClaimRobustnessScore): string {
  if (row.attacks_answered === 0 && row.attacks_open === 0) {
    return "No attacks recorded yet.";
  }
  const dates = row.open_from_round_dates?.filter(Boolean) ?? [];
  const roundPart =
    dates.length > 0
      ? ` (from ${dates.join(", ")})`
      : row.open_from_rounds.length > 0
        ? ` (from ${row.open_from_rounds.length === 1 ? "a practice round" : `${row.open_from_rounds.length} practice rounds`})`
        : "";
  return `${row.attacks_answered} attack${row.attacks_answered === 1 ? "" : "s"} answered, ${row.attacks_open} open${row.attacks_open ? roundPart : ""}`;
}

/** Format a round timestamp for the attack summary (e.g. 21 Nov). */
export function formatRoundDateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
