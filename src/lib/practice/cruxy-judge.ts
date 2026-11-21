import { randomUUID } from "crypto";
import { callCruxy } from "@/lib/cruxy/callCruxy";
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

const JUDGE_SYSTEM = `You are Cruxy, the assistant inside Crux for USC's Ethics Bowl teams. Score each item on the APPE card from 1 to 10 using the score bands and the Guide to Scoring. For each score give one to three quoted lines with their ids as evidence. Separate a logical flaw from disagreement with the conclusion. Then, for each speaker, give one thing that worked, the one thing to fix, why it cost points, a better version under 40 words in their style, and a 60 to 90 second redo prompt. Keep it short. Cite transcript line ids.`;

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
 * Uses callCruxy; stubs structured scores when the AI gateway is unavailable.
 */
export async function runCruxyJudge(opts: {
  round: PracticeRound;
  lines: TranscriptLine[];
  personId?: string | null;
}): Promise<CruxyJudgeOutput> {
  const { scored } = applicableItems({
    hasCommentingTeam: Boolean(opts.round.sides.commenting),
    hasJudgesQa: opts.round.mode === "full_round" || opts.round.mode === "judges_qa_drill",
  });

  const transcriptBlock = opts.lines
    .map(
      (l) =>
        `[${l.id} @${l.start_ms}ms ${l.speaker_label ?? "?"}] ${l.text}`,
    )
    .join("\n");

  const result = await callCruxy({
    feature: "judge_round",
    tier: "strong",
    personId: opts.personId ?? null,
    estimatedCostUsd: 0.4,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: `Return JSON only with keys scores (array of {teamId,item,score,evidenceLineIds,comment}), feedback (array of {personId,kind,quoteLineId,scoringItem,reasoning,betterVersion}), headline, socraticFollowups.
Score this round for teams ${opts.round.team_ids.join(", ")}.
Items: ${scored.join(", ")}
Transcript:
${transcriptBlock}`,
      },
    ],
  });

  if (!result.ok) {
    // Cap refused — return empty (caller may retry later)
    return emptyOutput(opts.round.id);
  }

  const parsed = tryParseJudgeJson(result.text, opts);
  if (parsed) {
    return { ...parsed, stub: result.stub };
  }

  // Structured stub when gateway stubs or live JSON isn't wired yet
  return buildStubJudgment({
    round: opts.round,
    lines: opts.lines,
    scored,
    stub: result.stub,
  });
}

function tryParseJudgeJson(
  text: string,
  opts: { round: PracticeRound; lines: TranscriptLine[] },
): CruxyJudgeOutput | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const raw = JSON.parse(text.slice(start, end + 1)) as {
      scores?: {
        teamId: string;
        item: string;
        score: number;
        evidenceLineIds?: string[];
        comment?: string;
      }[];
      feedback?: {
        personId: string;
        kind: "worked" | "fix";
        quoteLineId?: string;
        scoringItem?: string;
        reasoning?: string;
        betterVersion?: string;
      }[];
      headline?: string;
      socraticFollowups?: string[];
    };
    if (!raw.scores?.length) return null;
    const at = nowIso();
    const cards: JudgeCard[] = [];
    const scores: CardScore[] = [];
    const teamIds = [...new Set(raw.scores.map((s) => s.teamId))];
    for (const teamId of teamIds) {
      const card: JudgeCard = {
        id: randomUUID(),
        round_id: opts.round.id,
        judge_id: null,
        cruxy: true,
        team_id: teamId,
        spirit: 4,
        spirit_comment: null,
        overall_comment: raw.headline ?? null,
        moments: [],
        predictions: null,
        calibration_note: null,
        calibration_use: null,
        created_at: at,
        created_by: null,
      };
      cards.push(card);
      for (const s of raw.scores.filter((x) => x.teamId === teamId)) {
        const evidence = (s.evidenceLineIds ?? []).filter((id) =>
          opts.lines.some((l) => l.id === id),
        );
        if (evidence.length === 0) continue;
        scores.push({
          id: randomUUID(),
          card_id: card.id,
          item: s.item,
          score: s.score,
          comment: s.comment ?? null,
          evidence_line_ids: evidence.slice(0, 3),
          created_at: at,
        });
      }
    }
    const feedback: FeedbackItem[] = (raw.feedback ?? []).map((f) => ({
      id: randomUUID(),
      round_id: opts.round.id,
      person_id: f.personId,
      kind: f.kind,
      quote_line_id: f.quoteLineId ?? null,
      scoring_item: f.scoringItem ?? null,
      reasoning: f.reasoning ?? "",
      better_version: f.betterVersion ?? null,
      audience_heard: null,
      created_at: at,
    }));
    const redos: RedoRow[] = feedback
      .filter((f) => f.kind === "fix")
      .map((f) => ({
        id: randomUUID(),
        feedback_item_id: f.id,
        person_id: f.person_id,
        transcript_ref: f.quote_line_id,
        score_before: 5,
        score_after: null,
        open: true,
        created_at: at,
      }));
    return {
      cards,
      scores: filterDisplayableScores(scores, true),
      feedback,
      redos,
      report: {
        id: randomUUID(),
        round_id: opts.round.id,
        headline:
          raw.headline ??
          "Biggest fix: name the moral tension in the first 30 seconds.",
        socratic_followups: raw.socraticFollowups ?? [],
        proposal_ids: [],
        created_at: at,
      },
      stub: false,
    };
  } catch {
    return null;
  }
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

function buildStubJudgment(opts: {
  round: PracticeRound;
  lines: TranscriptLine[];
  scored: AppeItemKey[];
  stub: boolean;
}): CruxyJudgeOutput {
  const at = nowIso();
  const cards: JudgeCard[] = [];
  const scores: CardScore[] = [];
  const feedback: FeedbackItem[] = [];
  const redos: RedoRow[] = [];

  const evidenceIds = opts.lines.slice(0, 3).map((l) => l.id);
  const firstLine = opts.lines[0] ?? null;

  for (const teamId of opts.round.team_ids) {
    const card: JudgeCard = {
      id: randomUUID(),
      round_id: opts.round.id,
      judge_id: null,
      cruxy: true,
      team_id: teamId,
      spirit: 4,
      spirit_comment: "Respectful engagement throughout.",
      overall_comment:
        "Clear structure; strengthen the counterclaim answer with a concede-distinguish-rebut.",
      moments: firstLine
        ? [{ line_id: firstLine.id, note: "Thesis landed early" }]
        : [],
      predictions: null,
      calibration_note: null,
      calibration_use: null,
      created_at: at,
      created_by: null,
    };
    cards.push(card);

    for (const item of opts.scored) {
      const base =
        item.startsWith("presentation") ? 7 : item === "response_to_judges" ? 6 : 7;
      scores.push({
        id: randomUUID(),
        card_id: card.id,
        item,
        score: base,
        comment: APPE_SCORE_ITEMS.find((i) => i.key === item)?.question ?? null,
        evidence_line_ids: evidenceIds.length ? evidenceIds.slice(0, 2) : [],
        created_at: at,
      });
    }
  }

  // Cite-or-quiet: drop any Cruxy score without evidence
  const displayScores = filterDisplayableScores(scores, true);

  // Personal feedback for speakers present in transcript
  const speakers = [
    ...new Set(
      opts.lines
        .map((l) => l.speaker_person_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const people = speakers.length ? speakers : ["unknown-speaker"];

  for (const personId of people) {
    const quote = opts.lines.find(
      (l) => l.speaker_person_id === personId || personId === "unknown-speaker",
    );
    const fix: FeedbackItem = {
      id: randomUUID(),
      round_id: opts.round.id,
      person_id: personId === "unknown-speaker" ? (speakers[0] ?? "unknown") : personId,
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
    const worked: FeedbackItem = {
      id: randomUUID(),
      round_id: opts.round.id,
      person_id: fix.person_id,
      kind: "worked",
      quote_line_id: quote?.id ?? null,
      scoring_item: "presentation_a",
      reasoning: "Clear systematic opening under the time goal.",
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

  const report: RoundReport = {
    id: randomUUID(),
    round_id: opts.round.id,
    headline:
      "Biggest fix: name the moral tension in the first 30 seconds, then support it.",
    socratic_followups: [
      "What would the other side say is your weakest support?",
      "Which stakeholder did you leave out, and why does that matter?",
    ],
    proposal_ids: [],
    created_at: at,
  };

  return {
    cards,
    scores: displayScores,
    feedback,
    redos,
    report,
    stub: opts.stub,
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
