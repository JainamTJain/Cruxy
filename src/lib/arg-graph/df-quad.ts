/**
 * DF-QuAD style gradual semantics (Rago / Baroni et al.).
 * Computed in code only — never ask a model for the number.
 *
 * Aggregation σ(E) = 1 - ∏(1 - v(e))
 * Combination (DF-QuAD): if σ⁻ >= σ⁺ then b - b·(σ⁻ - σ⁺), else b + (1 - b)·(σ⁺ - σ⁻)
 * Strength is recursive. A leaf argument starts at the base score (0.5) times
 * its edge weight, so one support does not saturate a claim at 100%. A node
 * that is itself attacked contributes less than that leaf; a node that is
 * itself supported contributes more. Cycles fall back to the leaf base.
 * Supporters raise the score; unanswered attacks lower it.
 */
import type { ArgEdge, ArgNodeKind, ClaimRobustnessScore } from "@/lib/arg-graph/types";

const BASE = 0.5;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

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

type ScoreCtx = {
  edges: ArgEdge[];
  stack: Set<string>;
  memo: Map<string, number>;
};

function clampWeight(weight: number): number {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return 1;
  return Math.min(1, w);
}

/**
 * DF-QuAD score of one node. A node with no supporters and no open attacks
 * is a leaf at the base score. Incoming edges use the same rule, so an
 * attacked support is weaker than a leaf support.
 */
function argumentStrength(
  kind: ArgNodeKind,
  id: string,
  ctx: ScoreCtx,
): number {
  const key = `${kind}|${id}`;
  const cached = ctx.memo.get(key);
  if (cached !== undefined) return cached;
  if (ctx.stack.has(key)) return BASE;
  ctx.stack.add(key);

  const supports = ctx.edges.filter(
    (e) => e.type === "supports" && e.to_kind === kind && e.to_id === id,
  );
  const openAttacks = ctx.edges.filter(
    (e) =>
      e.type === "attacks" &&
      e.to_kind === kind &&
      e.to_id === id &&
      !isAttackAnswered(e, ctx.edges),
  );

  const score =
    supports.length || openAttacks.length
      ? dfQuadScore({
          supportStrengths: supports.map((e) => edgeStrength(e, ctx)),
          unansweredAttackStrengths: openAttacks.map((e) =>
            edgeStrength(e, ctx),
          ),
        })
      : BASE;

  ctx.memo.set(key, score);
  ctx.stack.delete(key);
  return score;
}

/** Strength this edge contributes: the far node's score times the edge weight. */
function edgeStrength(e: ArgEdge, ctx: ScoreCtx): number {
  return Math.max(
    0.05,
    argumentStrength(e.from_kind, e.from_id, ctx) * clampWeight(e.weight),
  );
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

  // The claim being scored is already on the stack, so a cycle back to it
  // counts as the leaf base instead of a second pass.
  const ctx: ScoreCtx = {
    edges,
    stack: new Set([`claim|${claimId}`]),
    memo: new Map(),
  };
  const supportStrengths = supports.map((e) => edgeStrength(e, ctx));
  const unansweredAttackStrengths = open.map((e) => edgeStrength(e, ctx));
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

/** Calendar label for a practice round. Prefers the session date. */
export function practiceRoundDateLabel(input: {
  sessionDate?: string | null;
  startedAt?: string | null;
  createdAt?: string | null;
}): string | null {
  const raw = (
    input.sessionDate ||
    input.startedAt ||
    input.createdAt ||
    ""
  ).trim();
  if (!raw) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const month = MONTHS[Number(dateOnly[2]) - 1];
    const day = Number(dateOnly[3]);
    if (!month || day < 1 || day > 31) return null;
    return `${month} ${day}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!month || !day) return null;
  return `${month} ${day}`;
}

function joinDates(dates: string[]): string {
  const unique: string[] = [];
  for (const d of dates) {
    if (d && !unique.includes(d)) unique.push(d);
  }
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

export function formatAttackSummary(row: ClaimRobustnessScore): string {
  if (row.attacks_answered === 0 && row.attacks_open === 0) {
    return "No attacks recorded yet.";
  }
  const dated = joinDates(row.open_round_dates ?? []);
  const n = row.open_from_rounds.length;
  const roundPart = !row.attacks_open
    ? ""
    : dated
      ? ` (from ${dated})`
      : n > 0
        ? ` (from ${n === 1 ? "a practice round" : `${n} practice rounds`})`
        : "";
  return `${row.attacks_answered} attack${row.attacks_answered === 1 ? "" : "s"} answered, ${row.attacks_open} open${roundPart}`;
}
