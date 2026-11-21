/**
 * Wave 5 C: analyse human judge cards before they tune Cruxy.
 * F-255 to F-265. Real cards only; empty until cards exist.
 */
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { saveWorkedExample } from "@/lib/cruxy/examples";
import { logActivity } from "@/lib/db/repository";
import {
  getAnalysisByCardId,
  listAnalysesForRound,
  listItemUses,
  replaceItemUses,
  upsertAnalysis,
  getCorrection,
  upsertCorrection,
  type JudgeCardAnalysisRow,
  type JudgeCardItemUseRow,
  type UseDecision,
} from "@/lib/db/supabase/judge-card-extra";
import {
  getRoundById,
  listJudgeCards,
  getTranscript,
} from "@/lib/db/practice-repository";
import type {
  CardScore,
  JudgeCard,
  JudgeRow,
  TranscriptLine,
} from "@/lib/practice/types";

const AGREEMENT_THRESHOLD = 3;

export type CardAnalysisBundle = {
  analysis: JudgeCardAnalysisRow;
  itemUses: JudgeCardItemUseRow[];
};

export async function analyseHumanCard(opts: {
  card: JudgeCard;
  scores: CardScore[];
  lines: TranscriptLine[];
  peerCards: JudgeCard[];
  peerScores: CardScore[];
  priorCardsForJudge: JudgeCard[];
  judge: JudgeRow | null;
  competingTeamMember: boolean;
  arguedThisCase: boolean;
  personId?: string | null;
}): Promise<CardAnalysisBundle> {
  // Cruxy cards do not calibrate Cruxy.
  if (opts.card.cruxy) {
    throw new Error("Cruxy cards are not analysed for calibration.");
  }

  const existing = await getAnalysisByCardId(opts.card.id);
  if (existing && !existing.override_use) {
    const itemUses = await listItemUses(existing.id);
    if (itemUses.length) return { analysis: existing, itemUses };
  }

  const evidence = scoreEvidence(opts.scores, opts.lines);
  const lean = scorePositionLean(opts.scores, opts.peerScores);
  const drift = scoreDrift(opts.card, opts.priorCardsForJudge);
  const agreement = scoreAgreement(opts.card, opts.scores, opts.peerCards, opts.peerScores);
  const conflicts = scoreConflicts({
    competingTeamMember: opts.competingTeamMember,
    arguedThisCase: opts.arguedThisCase,
  });

  // F-255: background is only a starting guess, never a fixed weight.
  const backgroundGuess = opts.judge?.background
    ? `Starting guess from background "${opts.judge.background}". Influence is decided from this card's evidence, not a fixed weight.`
    : "No background on file. Influence is decided from this card's evidence only.";

  const overall_use = decideOverallUse({
    evidenceRatio: evidence.ratio,
    leanFlag: lean.flag,
    driftFlag: drift.flag,
    conflict: conflicts.flag,
  });

  const overall_note = [
    evidence.note,
    lean.note,
    drift.note,
    agreement.note,
    conflicts.note,
  ].join(" ");

  // Optional richer note through callCruxy (falls back to heuristics).
  const llmNote = await maybeEnrichNote({
    overall_note,
    scores: opts.scores,
    lines: opts.lines,
    personId: opts.personId,
  });

  const analysis = await upsertAnalysis({
    id: existing?.id,
    card_id: opts.card.id,
    round_id: opts.card.round_id,
    judge_id: opts.card.judge_id,
    background_guess: backgroundGuess,
    evidence_note: evidence.note,
    position_lean_note: lean.note,
    drift_note: drift.note,
    agreement_note: agreement.note,
    conflicts_note: conflicts.note,
    overall_note: llmNote || overall_note,
    overall_use,
    effective_use: existing?.override_use ?? overall_use,
    override_use: existing?.override_use ?? null,
    override_reason: existing?.override_reason ?? null,
    override_by: existing?.override_by ?? null,
    override_at: existing?.override_at ?? null,
    worked_example_id: existing?.worked_example_id ?? null,
    created_by: opts.personId ?? null,
  });

  const itemUses = await replaceItemUses(
    analysis.id,
    opts.scores.map((s) => {
      const decision = decideItemUse({
        score: s,
        lines: opts.lines,
        overall: analysis.effective_use,
        conflict: conflicts.flag,
      });
      return {
        item: String(s.item),
        use_decision: decision.use,
        reason: decision.reason,
      };
    }),
  );

  // F-263: move corrections only when several analysed cards agree.
  if (analysis.effective_use === "full" || analysis.effective_use === "reduced") {
    await maybeUpdateCorrections({
      cardId: opts.card.id,
      scores: opts.scores,
      use: analysis.effective_use,
    });
  }

  // F-264: strong analyses become worked examples for the Judge agent.
  let workedId = analysis.worked_example_id;
  if (analysis.effective_use === "full" && !workedId) {
    const round = await getRoundById(opts.card.round_id);
    const example = await saveWorkedExample({
      kind: "strong",
      agent: "judge",
      caseId: round?.case_id ?? null,
      teamId: opts.card.team_id,
      title: `Calibrated card ${opts.card.id.slice(0, 8)}`,
      body: analysis.overall_note,
      citationIds: opts.scores.flatMap((s) => s.evidence_line_ids).slice(0, 8),
      sourceRef: `judge_card:${opts.card.id}`,
      personId: opts.personId,
      approved: true,
    });
    workedId = example.id;
    await upsertAnalysis({
      ...analysis,
      worked_example_id: workedId,
    });
  }

  await logActivity({
    person_id: opts.personId ?? null,
    action: "judge_card_analysed",
    target: opts.card.id,
    meta: {
      overall_use: analysis.overall_use,
      effective_use: analysis.effective_use,
      items: itemUses.length,
    },
  });

  const fresh = (await getAnalysisByCardId(opts.card.id))!;
  return { analysis: fresh, itemUses };
}

export async function overrideCardAnalysis(opts: {
  cardId: string;
  use: UseDecision;
  reason: string;
  actorId: string;
}): Promise<JudgeCardAnalysisRow> {
  const existing = await getAnalysisByCardId(opts.cardId);
  if (!existing) throw new Error("Analyse the card before overriding.");
  const reason = opts.reason.trim();
  if (reason.length < 3) throw new Error("Write a reason for the override.");

  const updated = await upsertAnalysis({
    ...existing,
    override_use: opts.use,
    effective_use: opts.use,
    override_reason: reason,
    override_by: opts.actorId,
    override_at: new Date().toISOString(),
  });

  await logActivity({
    person_id: opts.actorId,
    action: "judge_card_analysis_overridden",
    target: opts.cardId,
    meta: { use: opts.use, reason },
  });

  return updated;
}

/** Run analysis for every human card on a round that still needs it. */
export async function ensureRoundCardAnalyses(opts: {
  roundId: string;
  personId?: string | null;
  competingCheck?: (judgePersonId: string | null) => boolean;
  arguedCheck?: (judgePersonId: string | null) => boolean;
  getJudge?: (judgeId: string | null) => JudgeRow | null;
}): Promise<CardAnalysisBundle[]> {
  const { cards, scores } = await listJudgeCards(opts.roundId);
  const lines = await getTranscript(opts.roundId);
  const human = cards.filter((c) => !c.cruxy);
  if (!human.length) return [];

  const out: CardAnalysisBundle[] = [];
  for (const card of human) {
    const cardScores = scores.filter((s) => s.card_id === card.id);
    if (!cardScores.length) continue;
    const peers = human.filter((c) => c.id !== card.id);
    const prior = human.filter(
      (c) =>
        c.judge_id &&
        c.judge_id === card.judge_id &&
        c.id !== card.id &&
        c.created_at <= card.created_at,
    );
    const judge = opts.getJudge?.(card.judge_id) ?? null;
    const personId = judge?.person_id ?? null;
    out.push(
      await analyseHumanCard({
        card,
        scores: cardScores,
        lines,
        peerCards: peers,
        peerScores: scores.filter((s) => peers.some((p) => p.id === s.card_id)),
        priorCardsForJudge: prior,
        judge,
        competingTeamMember: opts.competingCheck?.(personId) ?? false,
        arguedThisCase: opts.arguedCheck?.(personId) ?? false,
        personId: opts.personId,
      }),
    );
  }
  return out;
}

export async function memberSafeRoundScores(roundId: string): Promise<{
  cards: { id: string; cruxy: boolean; team_id: string; overall_comment: string | null }[];
  scores: CardScore[];
}> {
  const { cards, scores } = await listJudgeCards(roundId);
  // F-265: members see scores and reasons only (no analysis fields).
  return {
    cards: cards.map((c) => ({
      id: c.id,
      cruxy: c.cruxy,
      team_id: c.team_id,
      overall_comment: c.overall_comment,
    })),
    scores,
  };
}

export async function techAdminRoundAnalyses(roundId: string) {
  const analyses = await listAnalysesForRound(roundId);
  const withItems = await Promise.all(
    analyses.map(async (a) => ({
      analysis: a,
      itemUses: await listItemUses(a.id),
    })),
  );
  return withItems;
}

function scoreEvidence(scores: CardScore[], lines: TranscriptLine[]) {
  if (!scores.length) {
    return {
      ratio: 0,
      note: "Evidence: no scored items on this card yet.",
    };
  }
  let hits = 0;
  for (const s of scores) {
    const fromIds = s.evidence_line_ids.some((id) =>
      lines.some((l) => l.id === id),
    );
    const fromComment =
      Boolean(s.comment) &&
      lines.some((l) =>
        s.comment!.toLowerCase().includes(l.text.slice(0, 24).toLowerCase()),
      );
    if (fromIds || fromComment) hits += 1;
  }
  const ratio = hits / scores.length;
  return {
    ratio,
    note:
      ratio >= 0.6
        ? `Evidence: ${hits} of ${scores.length} items point at things said in the transcript, and scores fit the comments.`
        : `Evidence: only ${hits} of ${scores.length} items clearly match the transcript. Treat comments carefully.`,
  };
}

function scorePositionLean(scores: CardScore[], peerScores: CardScore[]) {
  if (!scores.length) {
    return { flag: false, note: "Position lean: not enough scores to check." };
  }
  const avg =
    scores.reduce((n, s) => n + (s.score ?? 0), 0) / Math.max(scores.length, 1);
  const peerAvg = peerScores.length
    ? peerScores.reduce((n, s) => n + (s.score ?? 0), 0) / peerScores.length
    : avg;
  const gap = avg - peerAvg;
  const flag = Math.abs(gap) >= 2.5;
  return {
    flag,
    note: flag
      ? `Position lean: this card averages ${avg.toFixed(1)} vs peers ${peerAvg.toFixed(1)}. Check whether scores track agreement with the conclusion rather than reasoning quality.`
      : `Position lean: averages sit close to other judges (${avg.toFixed(1)} vs ${peerAvg.toFixed(1)}). No clear lean from scores alone.`,
  };
}

function scoreDrift(card: JudgeCard, prior: JudgeCard[]) {
  if (!prior.length) {
    return {
      flag: false,
      note: "Drift: no earlier cards from this judge in the session to compare.",
    };
  }
  const hour = new Date(card.created_at).getHours();
  const late = hour >= 21 || hour < 6;
  return {
    flag: late,
    note: late
      ? `Drift: this card was filed late (${hour}:00). Compare with the judge's earlier cards before full use.`
      : `Drift: filed at ${hour}:00 with ${prior.length} earlier card(s) from this judge. No late-night flag.`,
  };
}

function scoreAgreement(
  card: JudgeCard,
  scores: CardScore[],
  peers: JudgeCard[],
  peerScores: CardScore[],
) {
  if (!peers.length) {
    return {
      note: "Agreement: only one human card so far for this round.",
    };
  }
  const gaps: string[] = [];
  for (const s of scores) {
    const others = peerScores.filter((p) => p.item === s.item);
    if (!others.length) continue;
    const peerAvg =
      others.reduce((n, x) => n + (x.score ?? 0), 0) / others.length;
    const gap = Math.abs((s.score ?? 0) - peerAvg);
    if (gap >= 2) gaps.push(`${s.item} (gap ${gap.toFixed(1)})`);
  }
  return {
    note: gaps.length
      ? `Agreement: far apart on ${gaps.slice(0, 4).join(", ")}.`
      : `Agreement: within about 2 points of other judges on scored items.`,
  };
}

function scoreConflicts(opts: {
  competingTeamMember: boolean;
  arguedThisCase: boolean;
}) {
  if (opts.competingTeamMember) {
    return {
      flag: true,
      note: "Conflicts: judge is on a competing USC team. Feedback only.",
    };
  }
  if (opts.arguedThisCase) {
    return {
      flag: true,
      note: "Conflicts: judge has argued a side of this case. Prefer feedback only until reviewed.",
    };
  }
  return {
    flag: false,
    note: "Conflicts: no competing-team or prior-advocacy flag on file.",
  };
}

function decideOverallUse(opts: {
  evidenceRatio: number;
  leanFlag: boolean;
  driftFlag: boolean;
  conflict: boolean;
}): UseDecision {
  if (opts.conflict) return "feedback_only";
  if (opts.evidenceRatio < 0.3) return "feedback_only";
  if (opts.evidenceRatio < 0.6 || opts.leanFlag || opts.driftFlag) {
    return "reduced";
  }
  return "full";
}

function decideItemUse(opts: {
  score: CardScore;
  lines: TranscriptLine[];
  overall: UseDecision;
  conflict: boolean;
}): { use: UseDecision; reason: string } {
  if (opts.conflict) {
    return {
      use: "feedback_only",
      reason: "Conflict on the card. Speakers still see the feedback.",
    };
  }
  const hasEvidence =
    opts.score.evidence_line_ids.some((id) =>
      opts.lines.some((l) => l.id === id),
    ) || Boolean(opts.score.comment?.trim());
  if (!hasEvidence) {
    return {
      use: "feedback_only",
      reason: "No transcript-linked evidence for this item.",
    };
  }
  if (opts.overall === "feedback_only") {
    return {
      use: "feedback_only",
      reason: "Card overall is feedback only.",
    };
  }
  if (opts.overall === "reduced") {
    return {
      use: "reduced",
      reason: "Card overall is reduced influence.",
    };
  }
  return {
    use: "full",
    reason: "Evidence matches the transcript. Use fully for calibration.",
  };
}

async function maybeEnrichNote(opts: {
  overall_note: string;
  scores: CardScore[];
  lines: TranscriptLine[];
  personId?: string | null;
}): Promise<string> {
  if (!opts.scores.length) return opts.overall_note;
  const result = await callCruxy({
    feature: "judge_card_analysis",
    tier: "small",
    personId: opts.personId,
    estimatedCostUsd: 0.08,
    messages: [
      {
        role: "system",
        content:
          "Rewrite this judge-card analysis as one short plain paragraph for a technical admin. Keep the facts. No middle dots. No em dashes. No inventing quotes.",
      },
      {
        role: "user",
        content: opts.overall_note,
      },
    ],
  });
  if (!result.ok || result.stub || !result.text.trim()) return opts.overall_note;
  return result.text
    .replace(/·/g, ",")
    .replace(/\u2014|\u2013/g, "-")
    .trim();
}

async function maybeUpdateCorrections(opts: {
  cardId: string;
  scores: CardScore[];
  use: UseDecision;
}) {
  const factor = opts.use === "full" ? 1 : 0.4;
  for (const s of opts.scores) {
    const item = String(s.item);
    const mid = 5.5;
    const deltaHint = ((s.score ?? mid) - mid) * 0.05 * factor;
    const current = (await getCorrection(item)) ?? {
      item,
      delta: 0,
      agreement_count: 0,
      last_card_ids: [],
      updated_at: new Date().toISOString(),
    };
    const ids = [...new Set([...current.last_card_ids, opts.cardId])].slice(
      -10,
    );
    const agreement_count = ids.length;
    // Only move the stored delta once several cards agree.
    const delta =
      agreement_count >= AGREEMENT_THRESHOLD
        ? Number(
            (
              current.delta * 0.7 +
              deltaHint * 0.3
            ).toFixed(3),
          )
        : current.delta;
    await upsertCorrection({
      item,
      delta,
      agreement_count,
      last_card_ids: ids,
      updated_at: new Date().toISOString(),
    });
  }
}
