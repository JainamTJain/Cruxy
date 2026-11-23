import { randomUUID } from "crypto";
import { runJudgeAgent } from "@/lib/cruxy/agents/judge";
import { listSimilarExamples } from "@/lib/cruxy/examples";
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
import {
  getJudgeGroundingPack,
  shouldPreferDriveGrounding,
} from "@/lib/practice/judge-grounding";
import { ensureCruxyJudgeQa } from "@/lib/practice/judge-qa";
import { countHumanCards } from "@/lib/db/supabase/judge-card-extra";
import { findJudgeCard, getReport } from "@/lib/db/practice-repository";
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

  // F-252: before human cards exist, ground in APPE Guide / score bands.
  const humanCards = await countHumanCards();
  const grounding = shouldPreferDriveGrounding(humanCards)
    ? await getJudgeGroundingPack()
    : null;

  // F-264: read worked examples from calibrated rounds.
  const examples = await listSimilarExamples({
    agent: "judge",
    caseId: opts.round.case_id,
    query: transcriptBlock.slice(0, 400),
    limit: 3,
  });
  const exampleBlock = examples
    .map((e) => `- (${e.kind}) ${e.title}: ${e.body.slice(0, 400)}`)
    .join("\n");

  const groundedTranscript = [
    grounding
      ? `GROUNDING (APPE Guide to Scoring, score bands, judges' Q&A):\n${grounding.text.slice(0, 8000)}`
      : "",
    exampleBlock
      ? `WORKED EXAMPLES from calibrated rounds:\n${exampleBlock}`
      : "",
    `Transcript:\n${transcriptBlock}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // F-251: prepare out-loud Q&A (one question + follow-up per seat).
  if (
    opts.round.mode === "full_round" ||
    opts.round.mode === "judges_qa_drill" ||
    opts.round.judges.cruxy
  ) {
    const qa = await ensureCruxyJudgeQa({
      roundId: opts.round.id,
      caseNumber: null,
      caseTitle: null,
      personId: opts.personId,
    });
    // Wave 6: classify real judge Qs onto claim nodes (attacks).
    if (qa.length && opts.round.case_id) {
      try {
        const { getCaseBrain } = await import("@/lib/case-brain/service");
        const { classifyJudgeQuestionsForRound } = await import(
          "@/lib/arg-graph/classify-judge-q"
        );
        for (const teamId of opts.round.team_ids) {
          const brain = await getCaseBrain(teamId, opts.round.case_id);
          await classifyJudgeQuestionsForRound({
            roundId: opts.round.id,
            teamId,
            caseId: opts.round.case_id,
            nodes: brain.claims,
            personId: opts.personId,
            questions: qa,
          });
        }
      } catch {
        // Classification is best-effort; judging continues.
      }
    }
  }

  const judged = await runJudgeAgent({
    teamIds: opts.round.team_ids,
    items: scored,
    transcriptBlock: groundedTranscript,
    lineSources,
    personId: opts.personId,
  });

  if (!opts.lines.length) {
    return emptyOutput(
      opts.round.id,
      "No transcript yet. End the round again after recording finishes.",
    );
  }

  // Only treat a refused / timed-out call as failure. Fixture stubs may briefly
  // have empty kept scores before remap; buildFromAgent still writes cards.
  if (judged.failed) {
    return failedOutput(
      opts.round.id,
      judged.headline ??
        judged.failReason ??
        "Cruxy could not finish judging. Human cards still count.",
    );
  }

  return await buildFromAgent({
    round: opts.round,
    lines: opts.lines,
    scored,
    judged,
  });
}

function emptyOutput(roundId: string, headline: string): CruxyJudgeOutput {
  return {
    cards: [],
    scores: [],
    feedback: [],
    redos: [],
    report: {
      id: randomUUID(),
      round_id: roundId,
      headline,
      socratic_followups: [],
      proposal_ids: [],
      created_at: nowIso(),
    },
    stub: true,
  };
}

function failedOutput(roundId: string, headline: string): CruxyJudgeOutput {
  return {
    cards: [],
    scores: [],
    feedback: [],
    redos: [],
    report: {
      id: randomUUID(),
      round_id: roundId,
      headline,
      socratic_followups: [
        "What part of your presentation felt weakest to you?",
        "Which judge question would you redo first?",
      ],
      proposal_ids: [],
      created_at: nowIso(),
    },
    stub: true,
  };
}

async function buildFromAgent(opts: {
  round: PracticeRound;
  lines: TranscriptLine[];
  scored: AppeItemKey[];
  judged: Awaited<ReturnType<typeof runJudgeAgent>>;
}): Promise<CruxyJudgeOutput> {
  const at = nowIso();
  const cards: JudgeCard[] = [];
  const scores: CardScore[] = [];
  const feedback: FeedbackItem[] = [];
  const redos: RedoRow[] = [];

  const realLineIds = opts.lines.map((l) => l.id);
  const firstLineId = realLineIds[0] ?? null;
  const prior = await getReport(opts.round.id);

  /** Map agent / fixture citation ids onto real transcript line ids. */
  function resolveLineId(candidate: string | null | undefined): string | null {
    if (candidate && realLineIds.includes(candidate)) return candidate;
    return firstLineId;
  }

  for (const teamId of opts.round.team_ids) {
    const existing =
      (await findJudgeCard({
        roundId: opts.round.id,
        teamId,
        cruxy: true,
      })) ?? null;
    const card: JudgeCard = {
      id: existing?.id ?? randomUUID(),
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
      created_at: existing?.created_at ?? at,
      created_by: null,
    };
    cards.push(card);

    for (const s of opts.judged.scores) {
      const evidenceIds = [
        ...new Set(
          s.evidence
            .map((e) => resolveLineId(e.line_id))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (evidenceIds.length === 0) continue;
      scores.push({
        id: randomUUID(),
        card_id: card.id,
        item: (s.item as AppeItemKey) || "presentation_a",
        score: s.score,
        comment:
          s.comment ??
          APPE_SCORE_ITEMS.find((i) => i.key === s.item)?.question ??
          null,
        evidence_line_ids: evidenceIds.slice(0, 3),
        created_at: at,
      });
    }
  }

  const displayScores = filterDisplayableScores(scores, true);

  // Re-finalize: keep existing personal feedback rather than duplicating rows.
  if (prior.feedback.length > 0) {
    const reportReuse: RoundReport = {
      id: prior.report?.id ?? randomUUID(),
      round_id: opts.round.id,
      headline:
        opts.judged.headline ??
        prior.report?.headline ??
        "Biggest fix: name the moral tension in the first 30 seconds, then support it.",
      socratic_followups:
        opts.judged.socratic_followups?.length
          ? opts.judged.socratic_followups
          : (prior.report?.socratic_followups ?? []),
      proposal_ids: prior.report?.proposal_ids ?? [],
      created_at: prior.report?.created_at ?? at,
    };
    return {
      cards,
      scores: displayScores,
      feedback: prior.feedback,
      redos: prior.redos,
      report: reportReuse,
      stub: opts.judged.stub,
    };
  }

  for (const sf of opts.judged.speaker_feedback) {
    const quoteId =
      resolveLineId(sf.citation_ids.find((id) => realLineIds.includes(id))) ??
      firstLineId;
    const personId =
      opts.lines.find((l) => l.id === quoteId)?.speaker_person_id ??
      sf.speaker_id;
    const fix: FeedbackItem = {
      id: randomUUID(),
      round_id: opts.round.id,
      person_id: personId,
      kind: "fix",
      quote_line_id: quoteId,
      scoring_item: "presentation_b",
      reasoning: sf.why_cost_points,
      better_version: sf.better_version,
      audience_heard: sf.fix,
      created_at: at,
    };
    const worked: FeedbackItem = {
      id: randomUUID(),
      round_id: opts.round.id,
      person_id: personId,
      kind: "worked",
      quote_line_id: quoteId,
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
      transcript_ref: quoteId,
      score_before: 6,
      score_after: null,
      open: true,
      created_at: at,
    });
  }

  // Only invent personal feedback when the agent produced real scores (fixtures /
  // live success) but omitted speaker_feedback. Never invent after a failed call.
  if (feedback.length === 0 && displayScores.length > 0 && !opts.judged.stub) {
    const speakers = [
      ...new Set(
        opts.lines
          .map((l) => l.speaker_person_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const people =
      speakers.length > 0
        ? speakers
        : [opts.lines[0]?.speaker_person_id ?? "speaker-unknown"];
    for (const personId of people) {
      const quote =
        opts.lines.find((l) => l.speaker_person_id === personId) ??
        opts.lines[0] ??
        null;
      if (!quote) continue;
      const fix: FeedbackItem = {
        id: randomUUID(),
        round_id: opts.round.id,
        person_id: personId,
        kind: "fix",
        quote_line_id: quote.id,
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
        transcript_ref: quote.id,
        score_before: 6,
        score_after: null,
        open: true,
        created_at: at,
      });
    }
  }

  // Fixture path (stub with scores) still needs personal sections for demos.
  if (feedback.length === 0 && displayScores.length > 0 && opts.judged.stub) {
    const quote = opts.lines[0];
    if (quote) {
      const personId = quote.speaker_person_id ?? "speaker-unknown";
      const fix: FeedbackItem = {
        id: randomUUID(),
        round_id: opts.round.id,
        person_id: personId,
        kind: "fix",
        quote_line_id: quote.id,
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
        person_id: personId,
        kind: "worked",
        quote_line_id: quote.id,
        scoring_item: "presentation_a",
        reasoning: "Clear structure and respectful tone throughout.",
        better_version: null,
        audience_heard: null,
        created_at: at,
      };
      feedback.push(worked, fix);
      redos.push({
        id: randomUUID(),
        feedback_item_id: fix.id,
        person_id: fix.person_id,
        transcript_ref: quote.id,
        score_before: 6,
        score_after: null,
        open: true,
        created_at: at,
      });
    }
  }

  const report: RoundReport = {
    id: prior.report?.id ?? randomUUID(),
    round_id: opts.round.id,
    headline:
      opts.judged.headline ??
      "Biggest fix: name the moral tension in the first 30 seconds, then support it.",
    socratic_followups: opts.judged.socratic_followups,
    proposal_ids: prior.report?.proposal_ids ?? [],
    created_at: prior.report?.created_at ?? at,
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
      note: "Conflict: judge is on a competing team. Feedback only.",
      use: "feedback_only",
    };
  }
  if (ratio < 0.3) {
    return {
      note: "Weak evidence match to transcript. Reduced influence.",
      use: "reduced",
    };
  }
  return {
    note: "Evidence aligns with transcript; usable for calibration.",
    use: "full",
  };
}
