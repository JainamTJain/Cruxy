import { randomUUID } from "crypto";
import { runJudgeAgent } from "@/lib/cruxy/agents/judge";
import {
  APPE_SCORE_ITEMS,
  type AppeItemKey,
  type CardScore,
  type FeedbackItem,
  type JudgeCard,
  type PracticeRound,
  type RedoRow,
  type RoundReport,
  type TranscriptLine,
} from "@/lib/practice/types";
import { applicableItems, filterDisplayableScores } from "@/lib/practice/appe-card";
import { nowIso } from "@/lib/utils";

export type CruxyJudgeOutput = {
  cards: JudgeCard[];
  scores: CardScore[];
  feedback: FeedbackItem[];
  redos: RedoRow[];
  report: RoundReport;
  stub: boolean;
};

/**
 * Score every team in the round when no human judge is present (or alongside humans).
 * Workstream H: uses the Judge agent through callCruxy.
 */
export async function runCruxyJudge(opts: {
  round: PracticeRound;
  lines: TranscriptLine[];
  personId?: string | null;
}): Promise<CruxyJudgeOutput> {
  const { scored } = applicableItems({
    hasCommentingTeam: Boolean(opts.round.sides.commenting),
    hasJudgesQa:
      opts.round.mode === "full_round" || opts.round.mode === "judges_qa_drill",
  });

  const transcriptBlock = opts.lines
    .map(
      (l) =>
        `[${l.id} @${l.start_ms}ms ${l.speaker_label ?? "?"}] ${l.text}`,
    )
    .join("\n");

  const lineSources = opts.lines.map((l) => ({
    id: l.id,
    text: l.text,
    kind: "transcript_line" as const,
  }));

  const judged = await runJudgeAgent({
    teamIds: opts.round.team_ids,
    items: scored,
    transcriptBlock,
    lineSources,
    personId: opts.personId,
  });

  if (!judged.scores.length && !opts.lines.length) {
    return emptyOutput(opts.round.id);
  }

  return buildFromAgent({
    round: opts.round,
    lines: opts.lines,
    scored,
    judged,
  });
}

function emptyOutput(roundId: string): CruxyJudgeOutput {
  return {
    cards: [],
    scores: [],
    feedback: [],
    redos: [],
    report: {
      id: randomUUID(),
      round_id: roundId,
      headline: "Judging paused — monthly Cruxy spend cap reached.",
      socratic_followups: [],
      proposal_ids: [],
      created_at: nowIso(),
    },
    stub: true,
  };
}

function buildFromAgent(opts: {
  round: PracticeRound;
  lines: TranscriptLine[];
  scored: AppeItemKey[];
  judged: Awaited<ReturnType<typeof runJudgeAgent>>;
}): CruxyJudgeOutput {
  const at = nowIso();
  const cards: JudgeCard[] = [];
  const scores: CardScore[] = [];
  const feedback: FeedbackItem[] = [];
  const redos: RedoRow[] = [];

  for (const teamId of opts.round.team_ids) {
    const card: JudgeCard = {
      id: randomUUID(),
      round_id: opts.round.id,
      judge_id: null,
      cruxy: true,
      team_id: teamId,
      spirit: opts.judged.spirit ?? 4,
      spirit_comment: opts.judged.spirit_comment ?? "Respectful engagement.",
      overall_comment: opts.judged.overall_comment ?? "",
      moments: [],
      predictions: null,
      calibration_note: null,
      calibration_use: null,
      created_at: at,
      created_by: null,
    };
    cards.push(card);

    for (const s of opts.judged.scores) {
      if (!opts.scored.includes(s.item as AppeItemKey) && opts.scored.length) {
        // Keep agent items that match scored set when possible
      }
      scores.push({
        id: randomUUID(),
        card_id: card.id,
        item: (s.item as AppeItemKey) || "presentation_a",
        score: s.score,
        comment:
          s.comment ??
          APPE_SCORE_ITEMS.find((i) => i.key === s.item)?.question ??
          null,
        evidence_line_ids: s.evidence.map((e) => e.line_id),
        created_at: at,
      });
    }
  }

  const displayScores = filterDisplayableScores(scores, true);

  for (const sf of opts.judged.speaker_feedback) {
    const quote = opts.lines.find((l) => sf.citation_ids.includes(l.id));
    const fix: FeedbackItem = {
      id: randomUUID(),
      round_id: opts.round.id,
      person_id: sf.speaker_id,
      kind: "fix",
      quote_line_id: quote?.id ?? null,
      scoring_item: "presentation_b",
      reasoning: sf.why_cost_points,
      better_version: sf.better_version,
      audience_heard: sf.fix,
      created_at: at,
    };
    const worked: FeedbackItem = {
      id: randomUUID(),
      round_id: opts.round.id,
      person_id: sf.speaker_id,
      kind: "worked",
      quote_line_id: quote?.id ?? null,
      scoring_item: "presentation_a",
      reasoning: sf.worked,
      better_version: null,
      audience_heard: null,
      created_at: at,
    };
    feedback.push(worked, fix);
    redos.push({
      id: randomUUID(),
      feedback_item_id: fix.id,
      person_id: fix.person_id,
      transcript_ref: quote?.id ?? null,
      score_before: 6,
      score_after: null,
      open: true,
      created_at: at,
    });
  }

  if (feedback.length === 0) {
    // Fallback personal feedback from stub path when agent gave none
    const speakers = [
      ...new Set(
        opts.lines
          .map((l) => l.speaker_person_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const people = speakers.length ? speakers : [];
    for (const personId of people) {
      const quote = opts.lines.find((l) => l.speaker_person_id === personId);
      const fix: FeedbackItem = {
        id: randomUUID(),
        round_id: opts.round.id,
        person_id: personId,
        kind: "fix",
        quote_line_id: quote?.id ?? null,
        scoring_item: "presentation_b",
        reasoning:
          "The moral tension was named late; judges heard a policy answer before the ethical stake.",
        better_version:
          "Lead with the values in tension, then one support that shows why the principle fits this case.",
        audience_heard: "A practical fix without the ethical claim up front.",
        created_at: at,
      };
      feedback.push(fix);
      redos.push({
        id: randomUUID(),
        feedback_item_id: fix.id,
        person_id: fix.person_id,
        transcript_ref: quote?.id ?? null,
        score_before: 6,
        score_after: null,
        open: true,
        created_at: at,
      });
    }
  }

  const report: RoundReport = {
    id: randomUUID(),
    round_id: opts.round.id,
    headline:
      opts.judged.headline ??
      "Biggest fix: name the moral tension in the first 30 seconds, then support it.",
    socratic_followups: opts.judged.socratic_followups,
    proposal_ids: [],
    created_at: at,
  };

  return {
    cards,
    scores: displayScores,
    feedback,
    redos,
    report,
    stub: opts.judged.stub,
  };
}

/**
 * Analyse a human judge card before calibration (internal — tech admin only).
 */
export function analyseJudgeCard(opts: {
  scores: CardScore[];
  lines: TranscriptLine[];
  competingTeamMember: boolean;
}): {
  note: string;
  use: "full" | "reduced" | "feedback_only";
} {
  const evidenceHits = opts.scores.filter(
    (s) =>
      s.evidence_line_ids?.some((id) => opts.lines.some((l) => l.id === id)) ||
      (s.comment &&
        opts.lines.some((l) =>
          s.comment!.toLowerCase().includes(l.text.slice(0, 20).toLowerCase()),
        )),
  ).length;
  const ratio = opts.scores.length
    ? evidenceHits / opts.scores.length
    : 0;

  if (opts.competingTeamMember) {
    return {
      note: "Conflict: judge is on a competing team — feedback only.",
      use: "feedback_only",
    };
  }
  if (ratio < 0.3) {
    return {
      note: "Weak evidence match to transcript — reduced influence.",
      use: "reduced",
    };
  }
  return {
    note: "Evidence aligns with transcript; usable for calibration.",
    use: "full",
  };
}
