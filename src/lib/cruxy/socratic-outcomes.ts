/**
 * Wave 6 / Workstream J: Socratic outcomes.
 * After a Socratic exchange, record whether the person's next attempt on a
 * linked claim improved (drill answer, flashcard recall, or round item score).
 */
import "server-only";

import { randomUUID } from "crypto";
import {
  insertCruxyOutcome,
  listCruxyOutcomes,
  type CruxyOutcomeRow,
} from "@/lib/cruxy/outcomes";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore } from "@/lib/db/sample-store";
import type { SocraticSession } from "@/lib/revision/types";
import { nowIso } from "@/lib/utils";

export type AttemptKind = "drill" | "flashcard" | "round";

export type SocraticPendingRow = {
  id: string;
  person_id: string;
  socratic_session_id: string;
  claim_id: string;
  case_id: string | null;
  score_before: number | null;
  created_at: string;
  created_by: string | null;
  resolved_at: string | null;
  outcome_id: string | null;
};

const samplePending: SocraticPendingRow[] = [];

/** Map raw attempt scores onto 0..1 for self-relative comparison. */
export function normalizeAttemptScore(
  kind: AttemptKind,
  raw: number,
): number {
  if (kind === "drill") return clamp01(raw);
  if (kind === "flashcard") return clamp01((raw - 1) / 3);
  return clamp01(raw / 10);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

async function lastBaselineForCase(
  personId: string,
  caseId: string,
): Promise<number | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const qIds = new Set(
      store.questions.filter((q) => q.case_id === caseId).map((q) => q.id),
    );
    const answers = store.answers
      .filter((a) => a.person_id === personId && qIds.has(a.question_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (answers[0]?.score != null) {
      return normalizeAttemptScore("drill", answers[0].score);
    }
    const cardIds = new Set(
      store.flashcards
        .filter((c) => c.case_id === caseId)
        .map((c) => c.id),
    );
    const reviews = store.card_reviews
      .filter((r) => r.person_id === personId && cardIds.has(r.card_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (reviews[0]) {
      return normalizeAttemptScore("flashcard", reviews[0].grade);
    }
    const judges = store.judge_attempts
      .filter((j) => j.person_id === personId && j.case_id === caseId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (judges[0]) {
      return normalizeAttemptScore("round", judges[0].score);
    }
    return null;
  }

  const sb = getServiceSupabase();
  const qRes = await sb
    .from("questions")
    .select("id")
    .eq("case_id", caseId);
  const qIds = (qRes.data ?? []).map((r: { id: string }) => r.id);
  if (qIds.length) {
    const aRes = await sb
      .from("answers")
      .select("score, created_at")
      .eq("person_id", personId)
      .in("question_id", qIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aRes.data?.score != null) {
      return normalizeAttemptScore("drill", Number(aRes.data.score));
    }
  }

  const cards = await sb
    .from("flashcards")
    .select("id")
    .eq("case_id", caseId);
  const cardIds = (cards.data ?? []).map((r: { id: string }) => r.id);
  if (cardIds.length) {
    const rRes = await sb
      .from("card_reviews")
      .select("grade, created_at")
      .eq("person_id", personId)
      .in("card_id", cardIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rRes.data?.grade != null) {
      return normalizeAttemptScore("flashcard", Number(rRes.data.grade));
    }
  }

  const jRes = await sb
    .from("judge_attempts")
    .select("score, created_at")
    .eq("person_id", personId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jRes.data?.score != null) {
    return normalizeAttemptScore("round", Number(jRes.data.score));
  }
  return null;
}

async function insertPending(row: SocraticPendingRow): Promise<void> {
  if (isSampleDataMode()) {
    samplePending.unshift(row);
    return;
  }
  const { error } = await getServiceSupabase()
    .from("socratic_outcome_pending")
    .upsert(
      {
        id: row.id,
        person_id: row.person_id,
        socratic_session_id: row.socratic_session_id,
        claim_id: row.claim_id,
        case_id: row.case_id,
        score_before: row.score_before,
        created_at: row.created_at,
        created_by: row.created_by,
        resolved_at: row.resolved_at,
        outcome_id: row.outcome_id,
      },
      { onConflict: "person_id,socratic_session_id,claim_id" },
    );
  if (error) throw new Error(`socratic_outcome_pending: ${error.message}`);
}

async function listOpenPending(opts: {
  personId: string;
  caseId?: string | null;
}): Promise<SocraticPendingRow[]> {
  if (isSampleDataMode()) {
    return samplePending.filter(
      (p) =>
        p.person_id === opts.personId &&
        !p.resolved_at &&
        (!opts.caseId || p.case_id === opts.caseId),
    );
  }
  let q = getServiceSupabase()
    .from("socratic_outcome_pending")
    .select("*")
    .eq("person_id", opts.personId)
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  if (opts.caseId) q = q.eq("case_id", opts.caseId);
  const { data, error } = await q;
  if (error) throw new Error(`socratic_outcome_pending list: ${error.message}`);
  return (data ?? []) as SocraticPendingRow[];
}

async function resolvePending(
  pendingId: string,
  outcomeId: string,
): Promise<void> {
  const at = nowIso();
  if (isSampleDataMode()) {
    const row = samplePending.find((p) => p.id === pendingId);
    if (row) {
      row.resolved_at = at;
      row.outcome_id = outcomeId;
    }
    return;
  }
  const { error } = await getServiceSupabase()
    .from("socratic_outcome_pending")
    .update({ resolved_at: at, outcome_id: outcomeId })
    .eq("id", pendingId);
  if (error) throw new Error(`socratic_outcome_pending resolve: ${error.message}`);
}

/**
 * Call when a Socratic session finishes. Opens one pending row per linked claim.
 */
export async function openSocraticOutcomes(
  session: SocraticSession,
): Promise<SocraticPendingRow[]> {
  if (session.status !== "done") return [];
  const claimIds = (session.claim_links ?? []).filter(Boolean);
  if (!claimIds.length) return [];

  const baseline = await lastBaselineForCase(
    session.person_id,
    session.case_id,
  );
  const opened: SocraticPendingRow[] = [];
  for (const claimId of claimIds) {
    const row: SocraticPendingRow = {
      id: randomUUID(),
      person_id: session.person_id,
      socratic_session_id: session.id,
      claim_id: claimId,
      case_id: session.case_id,
      score_before: baseline,
      created_at: nowIso(),
      created_by: session.person_id,
      resolved_at: null,
      outcome_id: null,
    };
    await insertPending(row);
    opened.push(row);
  }

  await logActivity({
    person_id: session.person_id,
    action: "socratic_outcomes_opened",
    target: session.id,
    meta: {
      claim_count: opened.length,
      score_before: baseline,
      case_id: session.case_id,
    },
  });
  return opened;
}

/**
 * After a drill / flashcard / round attempt, resolve matching open Socratic pendings.
 */
export async function observeClaimAttempt(input: {
  personId: string;
  caseId?: string | null;
  attemptKind: AttemptKind;
  scoreAfter: number;
  refId?: string | null;
}): Promise<CruxyOutcomeRow[]> {
  const pending = await listOpenPending({
    personId: input.personId,
    caseId: input.caseId ?? null,
  });
  if (!pending.length) return [];

  const after = normalizeAttemptScore(input.attemptKind, input.scoreAfter);
  const written: CruxyOutcomeRow[] = [];

  // One outcome per open claim from the oldest unresolved Socratic exchange
  // that matches this case (or any case if caseId omitted).
  const bySession = new Map<string, SocraticPendingRow[]>();
  for (const p of pending) {
    const arr = bySession.get(p.socratic_session_id) ?? [];
    arr.push(p);
    bySession.set(p.socratic_session_id, arr);
  }
  const firstSessionId = [...bySession.keys()][0];
  if (!firstSessionId) return [];
  const group = bySession.get(firstSessionId) ?? [];

  for (const p of group) {
    const before = p.score_before;
    const delta = before == null ? after : after - before;
    const improved = delta > 0.01;
    const row: CruxyOutcomeRow = {
      id: randomUUID(),
      person_id: input.personId,
      feedback_id: null,
      advice_ref: input.refId ?? p.socratic_session_id,
      agent: "coach",
      case_id: p.case_id,
      round_id: input.attemptKind === "round" ? (input.refId ?? null) : null,
      followed: true,
      score_before: before,
      score_after: after,
      score_delta: delta,
      judge_agreed: null,
      note: improved
        ? `Socratic follow-up improved on ${input.attemptKind}.`
        : `Socratic follow-up did not improve on ${input.attemptKind}.`,
      created_at: nowIso(),
      created_by: input.personId,
      claim_id: p.claim_id,
      attempt_kind: input.attemptKind,
      socratic_session_id: p.socratic_session_id,
    };
    await insertCruxyOutcome(row);
    await resolvePending(p.id, row.id);
    await logActivity({
      person_id: input.personId,
      action: "socratic_outcome",
      target: row.id,
      meta: {
        claim_id: p.claim_id,
        attempt_kind: input.attemptKind,
        score_delta: delta,
        improved,
      },
    });
    written.push(row);
  }
  return written;
}

export async function listPersonSocraticOutcomes(
  personId: string,
  limit = 40,
): Promise<CruxyOutcomeRow[]> {
  const all = await listCruxyOutcomes(200);
  return all
    .filter(
      (o) =>
        o.person_id === personId &&
        (o.agent === "coach" || Boolean(o.socratic_session_id)),
    )
    .slice(0, limit);
}

export async function summarizeSocraticOutcomesForWeek(opts?: {
  sinceDays?: number;
}): Promise<{
  sampleSize: number;
  improved: number;
  liftRate: number | null;
  byAttempt: Record<AttemptKind, number>;
  lines: string[];
}> {
  const sinceDays = opts?.sinceDays ?? 7;
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const all = await listCruxyOutcomes(200);
  const rows = all.filter(
    (o) =>
      Boolean(o.socratic_session_id) &&
      new Date(o.created_at).getTime() >= cutoff,
  );
  const improved = rows.filter((o) => (o.score_delta ?? 0) > 0.01);
  const byAttempt: Record<AttemptKind, number> = {
    drill: 0,
    flashcard: 0,
    round: 0,
  };
  for (const r of rows) {
    const k = r.attempt_kind as AttemptKind | null;
    if (k && k in byAttempt) byAttempt[k] += 1;
  }
  const lines =
    rows.length === 0
      ? [
          "Socratic outcomes: none yet this week. They appear after a finished drill and a later attempt on the same case.",
        ]
      : [
          `Socratic outcomes this week: ${rows.length} follow-up${rows.length === 1 ? "" : "s"}, ${improved.length} improved (${rows.length ? Math.round((improved.length / rows.length) * 100) : 0}% lift).`,
          `By attempt: drill ${byAttempt.drill}, flashcard ${byAttempt.flashcard}, round ${byAttempt.round}.`,
        ];
  return {
    sampleSize: rows.length,
    improved: improved.length,
    liftRate: rows.length ? improved.length / rows.length : null,
    byAttempt,
    lines,
  };
}

export function __clearSampleSocraticPendingForTests(): void {
  samplePending.length = 0;
}
