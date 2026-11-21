import {
  APPE_SCORE_ITEMS,
  type AppeItemKey,
  type CardScore,
  type JudgeCard,
} from "@/lib/practice/types";

export type TeamScoreColumn = {
  teamId: string;
  scores: Partial<Record<AppeItemKey, number>>;
  presentationTotal: number;
  teamTotal: number;
  notScored: AppeItemKey[];
};

/** Solo / vs-Cruxy rounds hide commentary columns that don't apply. */
export function applicableItems(opts: {
  hasCommentingTeam: boolean;
  hasJudgesQa: boolean;
}): { scored: AppeItemKey[]; notScored: AppeItemKey[] } {
  const scored: AppeItemKey[] = [
    "presentation_a",
    "presentation_b",
    "presentation_c",
  ];
  const notScored: AppeItemKey[] = [];
  if (opts.hasCommentingTeam) {
    scored.push("commentary", "response_to_commentary");
  } else {
    notScored.push("commentary", "response_to_commentary");
  }
  if (opts.hasJudgesQa) {
    scored.push("response_to_judges");
  } else {
    notScored.push("response_to_judges");
  }
  return { scored, notScored };
}

export function presentationTotal(
  scores: Partial<Record<AppeItemKey, number>>,
): number {
  return (
    (scores.presentation_a ?? 0) +
    (scores.presentation_b ?? 0) +
    (scores.presentation_c ?? 0)
  );
}

export function teamTotal(
  scores: Partial<Record<AppeItemKey, number>>,
  scored: AppeItemKey[],
): number {
  return scored.reduce((sum, key) => sum + (scores[key] ?? 0), 0);
}

export function emptyScores(): Partial<Record<AppeItemKey, number>> {
  const out: Partial<Record<AppeItemKey, number>> = {};
  for (const item of APPE_SCORE_ITEMS) out[item.key] = undefined;
  return out;
}

export function scoresFromCard(
  card: JudgeCard,
  cardScores: CardScore[],
): Partial<Record<AppeItemKey, number>> {
  const scores = emptyScores();
  for (const row of cardScores.filter((s) => s.card_id === card.id)) {
    scores[row.item as AppeItemKey] = row.score;
  }
  return scores;
}

export function validateEvidence(
  score: Pick<CardScore, "score" | "evidence_line_ids" | "comment">,
  cruxy: boolean,
): { ok: boolean; reason?: string } {
  if (cruxy && (!score.evidence_line_ids || score.evidence_line_ids.length < 1)) {
    return {
      ok: false,
      reason: "Cruxy scores require at least one transcript evidence line",
    };
  }
  if (score.score < 1 || score.score > 10) {
    return { ok: false, reason: "Score must be 1–10" };
  }
  return { ok: true };
}

/** Drop Cruxy scores that lack evidence (cite-or-quiet). */
export function filterDisplayableScores(
  scores: CardScore[],
  cruxy: boolean,
): CardScore[] {
  if (!cruxy) return scores;
  return scores.filter((s) => (s.evidence_line_ids?.length ?? 0) >= 1);
}
