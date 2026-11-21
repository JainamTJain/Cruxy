/**
 * F-357: Outcomes grade Cruxy — did following advice raise the next score,
 * and did judges later agree?
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { recentCruxyFeedback } from "@/lib/cruxy/examples";
import { logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";

export type CruxyOutcomeRow = {
  id: string;
  person_id: string | null;
  feedback_id: string | null;
  advice_ref: string | null;
  agent: string;
  case_id: string | null;
  round_id: string | null;
  followed: boolean | null;
  score_before: number | null;
  score_after: number | null;
  score_delta: number | null;
  judge_agreed: boolean | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  /** Wave 6: claim linked from a finished Socratic exchange. */
  claim_id?: string | null;
  /** Wave 6: drill | flashcard | round */
  attempt_kind?: string | null;
  socratic_session_id?: string | null;
};

const sampleOutcomes: CruxyOutcomeRow[] = [];

export async function insertCruxyOutcome(
  row: CruxyOutcomeRow,
): Promise<CruxyOutcomeRow> {
  if (isSampleDataMode()) {
    sampleOutcomes.unshift(row);
    return row;
  }
  const { error } = await getServiceSupabase().from("cruxy_outcomes").insert({
    id: row.id,
    person_id: row.person_id,
    feedback_id: row.feedback_id,
    advice_ref: row.advice_ref,
    agent: row.agent,
    case_id: row.case_id,
    round_id: row.round_id,
    followed: row.followed,
    score_before: row.score_before,
    score_after: row.score_after,
    score_delta: row.score_delta,
    judge_agreed: row.judge_agreed,
    note: row.note,
    created_at: row.created_at,
    created_by: row.created_by,
    claim_id: row.claim_id ?? null,
    attempt_kind: row.attempt_kind ?? null,
    socratic_session_id: row.socratic_session_id ?? null,
  });
  if (error) throw new Error(`cruxy_outcomes insert: ${error.message}`);
  return row;
}

export async function listCruxyOutcomes(limit = 50): Promise<CruxyOutcomeRow[]> {
  if (isSampleDataMode()) {
    return sampleOutcomes.slice(0, limit);
  }
  const { data, error } = await getServiceSupabase()
    .from("cruxy_outcomes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`cruxy_outcomes list: ${error.message}`);
  return (data ?? []) as CruxyOutcomeRow[];
}

type RedoLike = {
  person_id?: string | null;
  score_before?: number | null;
  score_after?: number | null;
  feedback_item_id?: string | null;
  round_id?: string | null;
  case_id?: string | null;
};

/**
 * After a redo or graded round, record whether Cruxy's advice correlated with
 * a score lift and (when human cards exist) judge agreement.
 */
export async function recordAdviceOutcome(input: {
  personId: string | null;
  agent: string;
  adviceRef?: string | null;
  feedbackId?: string | null;
  caseId?: string | null;
  roundId?: string | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  followed?: boolean | null;
  judgeAgreed?: boolean | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<CruxyOutcomeRow> {
  const before = input.scoreBefore ?? null;
  const after = input.scoreAfter ?? null;
  const delta =
    before != null && after != null ? Number(after) - Number(before) : null;

  const row: CruxyOutcomeRow = {
    id: randomUUID(),
    person_id: input.personId,
    feedback_id: input.feedbackId ?? null,
    advice_ref: input.adviceRef ?? null,
    agent: input.agent,
    case_id: input.caseId ?? null,
    round_id: input.roundId ?? null,
    followed: input.followed ?? null,
    score_before: before,
    score_after: after,
    score_delta: delta,
    judge_agreed: input.judgeAgreed ?? null,
    note: input.note ?? null,
    created_at: nowIso(),
    created_by: input.createdBy ?? input.personId,
    claim_id: null,
    attempt_kind: null,
    socratic_session_id: null,
  };

  await insertCruxyOutcome(row);
  await logActivity({
    person_id: input.personId,
    action: "cruxy_outcome",
    target: row.id,
    meta: {
      agent: row.agent,
      score_delta: row.score_delta,
      judge_agreed: row.judge_agreed,
    },
  });
  return row;
}

/** Summarize outcomes for the admin Working page. */
export async function summarizeCruxyOutcomes(): Promise<{
  sampleSize: number;
  avgDelta: number | null;
  liftRate: number | null;
  judgeAgreeRate: number | null;
  usefulFeedback: number;
  note: string;
}> {
  const [outcomes, feedback] = await Promise.all([
    listCruxyOutcomes(200),
    recentCruxyFeedback({ sinceDays: 90, limit: 200 }).catch(() => []),
  ]);

  const withDelta = outcomes.filter((o) => o.score_delta != null);
  const lifts = withDelta.filter((o) => (o.score_delta ?? 0) > 0);
  const judgeRows = outcomes.filter((o) => o.judge_agreed != null);
  const judgeYes = judgeRows.filter((o) => o.judge_agreed);

  const usefulFeedback = feedback.filter((f) => f.verdict === "useful").length;

  const avgDelta =
    withDelta.length === 0
      ? null
      : withDelta.reduce((s, o) => s + Number(o.score_delta ?? 0), 0) /
        withDelta.length;

  return {
    sampleSize: outcomes.length,
    avgDelta,
    liftRate: withDelta.length ? lifts.length / withDelta.length : null,
    judgeAgreeRate: judgeRows.length ? judgeYes.length / judgeRows.length : null,
    usefulFeedback,
    note:
      outcomes.length === 0
        ? "No outcome links yet. They appear after redos and graded rounds that follow Cruxy advice."
        : `Cruxy advice checked against ${outcomes.length} follow-up outcome${outcomes.length === 1 ? "" : "s"}.`,
  };
}

/** Helper for practice pipeline: map redo rows into outcomes. */
export async function recordOutcomesFromRedos(
  redos: RedoLike[],
  opts?: { agent?: string; createdBy?: string | null },
): Promise<number> {
  let n = 0;
  for (const r of redos) {
    if (r.score_before == null || r.score_after == null) continue;
    await recordAdviceOutcome({
      personId: r.person_id ?? null,
      agent: opts?.agent ?? "judge",
      feedbackId: r.feedback_item_id ?? null,
      caseId: r.case_id ?? null,
      roundId: r.round_id ?? null,
      scoreBefore: r.score_before,
      scoreAfter: r.score_after,
      followed: true,
      note: "Auto-linked from redo score_before/score_after",
      createdBy: opts?.createdBy ?? null,
    });
    n += 1;
  }
  return n;
}

export function __clearSampleOutcomesForTests(): void {
  sampleOutcomes.length = 0;
}
