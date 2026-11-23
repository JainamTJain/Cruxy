import "server-only";
import { createHash, randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { iso, isoOrNull, type Row } from "@/lib/db/supabase/util";
import { logActivity } from "@/lib/db/repository";
import type { CaseRow } from "@/lib/types";
import {
  DEFAULT_ROUND_TIMINGS,
  type AttendanceRow,
  type AttendanceStatus,
  type BankEntry,
  type CardScore,
  type FeedbackItem,
  type GlossaryTerm,
  type JudgeCard,
  type JudgeRow,
  type PracticeMode,
  type PracticeRound,
  type PracticeSession,
  type RecordingRow,
  type RedoRow,
  type RoundReport,
  type RoundTimings,
  type SessionKind,
  type SkillChart,
  type SpeakerLabelConfirm,
  type TranscriptLine,
} from "@/lib/practice/types";
import {
  generateGuestToken,
  generateSessionCode,
  hashGuestToken,
  hashSessionCode,
  normalizeCode,
  verifySessionCode,
} from "@/lib/practice/session-codes";
import { buildCaseGlossary } from "@/lib/practice/glossary";
import { nowIso, addMinutes } from "@/lib/utils";

const MAX_CODE_FAILURES = 5;
const CODE_LOCK_MINUTES = 10;

function must<T>(
  res: { data: T; error: { message: string } | null },
  ctx: string,
): T {
  assertOk(res.error, ctx);
  return res.data;
}

// ---------- row mappers ----------

export function mapSession(r: Row): PracticeSession {
  return {
    id: r.id,
    kind: r.kind,
    date: r.date,
    place: r.place ?? null,
    online: Boolean(r.online),
    code_hash: r.code_hash ?? null,
    title: r.title,
    status: r.status,
    created_by: r.created_by ?? null,
    created_at: iso(r.created_at),
    mode: r.mode ?? null,
    invite_team_ids: r.invite_team_ids ?? [],
  };
}

export function mapRound(r: Row): PracticeRound {
  return {
    id: r.id,
    session_id: r.session_id,
    case_id: r.case_id ?? null,
    case_number: r.case_number ?? null,
    team_ids: r.teams ?? [],
    sides: r.sides ?? { presenting: null, commenting: null },
    moderator: r.moderator ?? null,
    judges: r.judges ?? { humans: [], cruxy: false },
    timings: { ...DEFAULT_ROUND_TIMINGS, ...(r.timings ?? {}) },
    phase: r.phase,
    mode: r.mode,
    order: r.ord ?? 0,
    started_at: isoOrNull(r.started_at),
    ended_at: isoOrNull(r.ended_at),
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    recording_layout: (r.recording_layout as PracticeRound["recording_layout"]) ?? "room",
    drill_checkpoint: (r.drill_checkpoint as PracticeRound["drill_checkpoint"]) ?? null,
    phase_entered_at: isoOrNull(r.phase_entered_at),
  };
}

function roundToRow(r: PracticeRound): Row {
  return {
    id: r.id,
    session_id: r.session_id,
    case_id: r.case_id,
    case_number: r.case_number,
    teams: r.team_ids,
    sides: r.sides,
    moderator: r.moderator,
    judges: r.judges,
    timings: r.timings,
    phase: r.phase,
    mode: r.mode,
    ord: r.order,
    started_at: r.started_at,
    ended_at: r.ended_at,
    created_at: r.created_at,
    created_by: r.created_by,
    recording_layout: r.recording_layout ?? "room",
    drill_checkpoint: r.drill_checkpoint ?? null,
    phase_entered_at: r.phase_entered_at ?? null,
  };
}

function mapAttendance(r: Row): AttendanceRow {
  return {
    id: r.id,
    session_id: r.session_id,
    person_id: r.person_id,
    status: r.status,
    source: r.source,
    created_at: iso(r.created_at),
  };
}

function mapRecording(r: Row): RecordingRow {
  return {
    id: r.id,
    round_id: r.round_id,
    chunk_paths: r.chunk_paths ?? [],
    chunk_meta: r.chunk_meta ?? [],
    status: r.status,
    deleted_at: isoOrNull(r.deleted_at),
    transcript_job_id: r.transcript_job_id ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    owner_person_id: (r.owner_person_id as string | null) ?? null,
    started_at: isoOrNull(r.started_at),
  };
}

function mapLine(r: Row): TranscriptLine {
  return {
    id: r.id,
    round_id: r.round_id,
    start_ms: r.start_ms ?? 0,
    end_ms: r.end_ms ?? 0,
    speaker_person_id: r.speaker_person_id ?? null,
    speaker_label: r.speaker_label ?? null,
    text: r.text,
    corrected: Boolean(r.corrected),
    created_at: iso(r.created_at),
  };
}

function mapGlossary(r: Row): GlossaryTerm {
  return {
    id: r.id,
    case_id: r.case_id ?? null,
    term: r.term,
    misheard: r.misheard ?? [],
    pronunciation: r.pronunciation ?? null,
    created_at: iso(r.created_at),
  };
}

function mapJudge(r: Row): JudgeRow {
  return {
    id: r.id,
    name: r.name,
    background: r.background ?? null,
    weight: r.weight ?? null,
    person_id: r.person_id ?? null,
    guest_token_hash: r.guest_token_hash ?? null,
    created_at: iso(r.created_at),
  };
}

function mapCard(r: Row): JudgeCard {
  return {
    id: r.id,
    round_id: r.round_id,
    judge_id: r.judge_id ?? null,
    cruxy: Boolean(r.cruxy),
    team_id: r.team_id,
    spirit: r.spirit ?? null,
    spirit_comment: r.spirit_comment ?? null,
    overall_comment: r.overall_comment ?? null,
    moments: r.moments ?? [],
    predictions: r.predictions ?? null,
    calibration_note: r.calibration_note ?? null,
    calibration_use: r.calibration_use ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function cardToRow(c: JudgeCard): Row {
  return {
    id: c.id,
    round_id: c.round_id,
    judge_id: c.judge_id,
    cruxy: c.cruxy,
    team_id: c.team_id,
    spirit: c.spirit,
    spirit_comment: c.spirit_comment,
    overall_comment: c.overall_comment,
    moments: c.moments,
    predictions: c.predictions,
    calibration_note: c.calibration_note,
    calibration_use: c.calibration_use,
    created_at: c.created_at,
    created_by: c.created_by,
  };
}

function mapScore(r: Row): CardScore {
  return {
    id: r.id,
    card_id: r.card_id,
    item: r.item,
    score: r.score ?? 0,
    comment: r.comment ?? null,
    evidence_line_ids: r.evidence_line_ids ?? [],
    created_at: iso(r.created_at),
  };
}

function scoreToRow(s: CardScore): Row {
  return {
    id: s.id,
    card_id: s.card_id,
    item: s.item,
    score: s.score,
    comment: s.comment,
    evidence_line_ids: s.evidence_line_ids,
    created_at: s.created_at,
  };
}

function mapFeedback(r: Row): FeedbackItem {
  return {
    id: r.id,
    round_id: r.round_id,
    person_id: r.person_id,
    kind: r.kind,
    quote_line_id: r.quote_line_id ?? null,
    scoring_item: r.scoring_item ?? null,
    reasoning: r.reasoning ?? "",
    better_version: r.better_version ?? null,
    audience_heard: r.audience_heard ?? null,
    created_at: iso(r.created_at),
  };
}

function feedbackToRow(f: FeedbackItem): Row {
  return {
    id: f.id,
    round_id: f.round_id,
    person_id: f.person_id,
    kind: f.kind,
    quote_line_id: f.quote_line_id,
    scoring_item: f.scoring_item,
    reasoning: f.reasoning,
    better_version: f.better_version,
    audience_heard: f.audience_heard,
    created_at: f.created_at,
  };
}

function mapRedo(r: Row): RedoRow {
  return {
    id: r.id,
    feedback_item_id: r.feedback_item_id,
    person_id: r.person_id,
    transcript_ref: r.transcript_ref ?? null,
    score_before: r.score_before ?? null,
    score_after: r.score_after ?? null,
    open: r.open ?? true,
    created_at: iso(r.created_at),
  };
}

function redoToRow(r: RedoRow): Row {
  return {
    id: r.id,
    feedback_item_id: r.feedback_item_id,
    person_id: r.person_id,
    transcript_ref: r.transcript_ref,
    score_before: r.score_before,
    score_after: r.score_after,
    open: r.open,
    created_at: r.created_at,
  };
}

function mapReport(r: Row): RoundReport {
  return {
    id: r.id,
    round_id: r.round_id,
    headline: r.headline,
    socratic_followups: r.socratic_followups ?? [],
    proposal_ids: r.proposal_ids ?? [],
    created_at: iso(r.created_at),
  };
}

function mapBank(r: Row): BankEntry {
  return {
    id: r.id,
    lesson: r.lesson,
    example_line_id: r.example_line_id ?? null,
    why: r.why ?? null,
    improved: r.improved ?? null,
    drill_id: r.drill_id ?? null,
    seen_count: r.seen_count ?? 0,
    case_id: r.case_id ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

// ---------- cases / sessions ----------

export async function listCases(): Promise<CaseRow[]> {
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb.from("cases").select("*").order("number", { ascending: true }),
      "listCases",
    ) ?? [];
  return rows.map((r: Row) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    case_set_page: r.case_set_page ?? null,
    crux: r.crux ?? null,
    trap: r.trap ?? null,
    closing_question: r.closing_question ?? null,
    active: Boolean(r.active),
    created_at: iso(r.created_at),
  }));
}

async function roundsForSessions(sessionIds: string[]): Promise<PracticeRound[]> {
  if (sessionIds.length === 0) return [];
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("rounds")
        .select("*")
        .in("session_id", sessionIds)
        .order("ord", { ascending: true }),
      "roundsForSessions",
    ) ?? [];
  return rows.map(mapRound);
}

export async function listSessions(opts?: {
  forPersonId?: string;
  admin?: boolean;
}): Promise<
  (PracticeSession & { code?: string | null; rounds: PracticeRound[] })[]
> {
  const sb = getServiceSupabase();
  const sessionRows =
    must(
      await sb
        .from("sessions")
        .select("*")
        .order("created_at", { ascending: true }),
      "listSessions",
    ) ?? [];
  const rounds = await roundsForSessions(sessionRows.map((s: Row) => s.id));
  return sessionRows.map((row: Row) => {
    const s = mapSession(row);
    return {
      ...s,
      code: opts?.admin ? null : undefined,
      code_hash: opts?.admin ? s.code_hash : null,
      rounds: rounds.filter((r) => r.session_id === s.id),
    };
  });
}

export async function getSessionById(
  id: string,
): Promise<(PracticeSession & { rounds: PracticeRound[] }) | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb.from("sessions").select("*").eq("id", id).maybeSingle(),
    "getSessionById",
  );
  if (!row) return null;
  return { ...mapSession(row), rounds: await roundsForSessions([id]) };
}

export async function getRoundById(
  id: string,
): Promise<(PracticeRound & { session: PracticeSession }) | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb.from("rounds").select("*").eq("id", id).maybeSingle(),
    "getRoundById",
  );
  if (!row) return null;
  const sessionRow = must(
    await sb.from("sessions").select("*").eq("id", row.session_id).maybeSingle(),
    "getRoundById.session",
  );
  if (!sessionRow) return null;
  return { ...mapRound(row), session: mapSession(sessionRow) };
}

type CreateSessionInput = {
  kind: SessionKind;
  title: string;
  date: string;
  place: string | null;
  online: boolean;
  createdBy: string;
  mode?: PracticeMode | null;
  inviteTeamIds?: string[];
  rounds: {
    caseId: string | null;
    caseNumber: number | null;
    teamIds: string[];
    sides: { presenting: string | null; commenting: string | null };
    moderator: "cruxy" | string | null;
    judges: { humans: string[]; cruxy: boolean };
    timings?: Partial<RoundTimings>;
    mode: PracticeMode;
  }[];
};

export async function createSession(
  input: CreateSessionInput,
): Promise<{ session: PracticeSession; rounds: PracticeRound[]; plainCode: string | null }> {
  const sb = getServiceSupabase();
  const plainCode = generateSessionCode();
  const codeHash = await hashSessionCode(plainCode);
  const at = nowIso();

  const session: PracticeSession = {
    id: randomUUID(),
    kind: input.kind,
    date: input.date,
    place: input.place,
    online: input.online,
    code_hash: codeHash,
    title: input.title,
    status: "scheduled",
    created_by: input.createdBy,
    created_at: at,
    mode: input.mode ?? null,
    invite_team_ids: input.inviteTeamIds ?? [],
  };

  const rounds: PracticeRound[] = input.rounds.map((r, i) => ({
    id: randomUUID(),
    session_id: session.id,
    case_id: r.caseId,
    case_number: r.caseNumber,
    team_ids: r.teamIds,
    sides: r.sides,
    moderator: r.moderator,
    judges: r.judges,
    timings: { ...DEFAULT_ROUND_TIMINGS, ...r.timings },
    phase: "setup",
    mode: r.mode,
    order: i,
    started_at: null,
    ended_at: null,
    created_at: at,
    created_by: input.createdBy,
    recording_layout: input.online ? "own_device" : "room",
    drill_checkpoint: null,
    phase_entered_at: null,
  }));

  assertOk(
    (
      await sb.from("sessions").insert({
        id: session.id,
        kind: session.kind,
        date: session.date,
        place: session.place,
        online: session.online,
        code_hash: session.code_hash,
        title: session.title,
        status: session.status,
        created_by: session.created_by,
        created_at: session.created_at,
        mode: session.mode,
        invite_team_ids: session.invite_team_ids,
      })
    ).error,
    "createSession",
  );

  try {
    if (rounds.length > 0) {
      assertOk(
        (await sb.from("rounds").insert(rounds.map(roundToRow))).error,
        "createSession.rounds",
      );
    }

    const caseIds = [
      ...new Set(rounds.map((r) => r.case_id).filter((x): x is string => !!x)),
    ];
    if (caseIds.length > 0) {
      const caseRows =
        must(
          await sb.from("cases").select("id,title").in("id", caseIds),
          "createSession.cases",
        ) ?? [];
      const existing =
        must(
          await sb
            .from("glossary_terms")
            .select("case_id,term")
            .in("case_id", caseIds),
          "createSession.glossary",
        ) ?? [];
      const seen = new Set(
        existing.map((g: Row) => `${g.case_id}:${String(g.term).toLowerCase()}`),
      );
      const toInsert: GlossaryTerm[] = [];
      for (const caseId of caseIds) {
        const caseRow = caseRows.find((c: Row) => c.id === caseId);
        const glossary = buildCaseGlossary({
          caseId,
          caseTitle: caseRow?.title,
        });
        for (const g of glossary) {
          const key = `${g.case_id}:${g.term.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          toInsert.push(g);
        }
      }
      if (toInsert.length > 0) {
        assertOk(
          (
            await sb.from("glossary_terms").insert(
              toInsert.map((g) => ({
                id: g.id,
                case_id: g.case_id,
                term: g.term,
                misheard: g.misheard,
                pronunciation: g.pronunciation,
                created_at: g.created_at,
              })),
            )
          ).error,
          "createSession.glossary.insert",
        );
      }
    }
  } catch (err) {
    await sb.from("rounds").delete().eq("session_id", session.id);
    await sb.from("sessions").delete().eq("id", session.id);
    throw err;
  }

  await logActivity({
    person_id: input.createdBy,
    action: "session_created",
    target: session.id,
    meta: { kind: input.kind, rounds: rounds.length },
  });

  return { session, rounds, plainCode };
}

/** Admin-only: re-issue a new code (returns plaintext once). */
export async function rotateSessionCode(
  sessionId: string,
  adminId: string,
): Promise<string> {
  const sb = getServiceSupabase();
  const plain = generateSessionCode();
  const hash = await hashSessionCode(plain);
  assertOk(
    (await sb.from("sessions").update({ code_hash: hash }).eq("id", sessionId))
      .error,
    "rotateSessionCode",
  );
  await logActivity({
    person_id: adminId,
    action: "session_code_rotated",
    target: sessionId,
  });
  return plain;
}

/** Raw IPs are never stored: attempts are keyed by a sha256 of the caller key. */
function hashIpKey(ipKey: string | undefined): string {
  return createHash("sha256").update(ipKey ?? "local").digest("hex");
}

export async function joinWithSessionCode(opts: {
  code: string;
  personId?: string | null;
  ipKey?: string;
}): Promise<
  | { ok: true; session: PracticeSession; rounds: PracticeRound[] }
  | { ok: false; reason: string }
> {
  const sb = getServiceSupabase();
  const ipHash = hashIpKey(opts.ipKey);
  const since = addMinutes(new Date(), -CODE_LOCK_MINUTES).toISOString();

  const recent =
    must(
      await sb
        .from("session_code_attempts")
        .select("attempted_at")
        .eq("ip_hash", ipHash)
        .gte("attempted_at", since)
        .order("attempted_at", { ascending: false }),
      "joinWithSessionCode.attempts",
    ) ?? [];
  if (recent.length >= MAX_CODE_FAILURES) {
    return { ok: false, reason: "Too many tries. Wait 10 minutes." };
  }

  const sessionRows =
    must(
      await sb
        .from("sessions")
        .select("*")
        .not("code_hash", "is", null)
        .order("created_at", { ascending: false }),
      "joinWithSessionCode.sessions",
    ) ?? [];

  let matched: PracticeSession | null = null;
  for (const row of sessionRows) {
    if (await verifySessionCode(row.code_hash, opts.code)) {
      matched = mapSession(row);
      break;
    }
  }

  if (!matched) {
    // session_id is required on the attempts table, so a failed guess is
    // recorded against the newest session that has a code.
    const target = sessionRows[0]?.id as string | undefined;
    if (target) {
      assertOk(
        (
          await sb
            .from("session_code_attempts")
            .insert({ session_id: target, ip_hash: ipHash })
        ).error,
        "joinWithSessionCode.recordFailure",
      );
    }
    await logActivity({
      person_id: opts.personId ?? null,
      action: "session_code_failed",
      target: normalizeCode(opts.code).slice(0, 2) + "****",
    });
    return { ok: false, reason: "Invalid session code" };
  }

  assertOk(
    (await sb.from("session_code_attempts").delete().eq("ip_hash", ipHash))
      .error,
    "joinWithSessionCode.clearAttempts",
  );

  const rounds = await roundsForSessions([matched.id]);

  if (opts.personId) {
    await upsertAttendance({
      sessionId: matched.id,
      personId: opts.personId,
      status: "present",
      source: "join",
    });
  }

  return { ok: true, session: matched, rounds };
}

export async function upsertAttendance(opts: {
  sessionId: string;
  personId: string;
  status: AttendanceStatus;
  source: AttendanceRow["source"];
}): Promise<AttendanceRow> {
  const sb = getServiceSupabase();
  const existing = must(
    await sb
      .from("attendance")
      .select("*")
      .eq("session_id", opts.sessionId)
      .eq("person_id", opts.personId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    "upsertAttendance.find",
  );
  if (existing) {
    const updated = must(
      await sb
        .from("attendance")
        .update({ status: opts.status, source: opts.source })
        .eq("id", existing.id)
        .select("*")
        .single(),
      "upsertAttendance.update",
    );
    return mapAttendance(updated);
  }
  const inserted = must(
    await sb
      .from("attendance")
      .insert({
        id: randomUUID(),
        session_id: opts.sessionId,
        person_id: opts.personId,
        status: opts.status,
        source: opts.source,
        created_at: nowIso(),
      })
      .select("*")
      .single(),
    "upsertAttendance.insert",
  );
  return mapAttendance(inserted);
}

export async function listAttendance(sessionId: string): Promise<AttendanceRow[]> {
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("attendance")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      "listAttendance",
    ) ?? [];
  return rows.map(mapAttendance);
}

export async function startRound(roundId: string): Promise<PracticeRound | null> {
  const sb = getServiceSupabase();
  const at = nowIso();
  const row = must(
    await sb
      .from("rounds")
      .update({
        phase: "presentation",
        started_at: at,
        phase_entered_at: at,
      })
      .eq("id", roundId)
      .select("*")
      .maybeSingle(),
    "startRound",
  );
  if (!row) return null;
  assertOk(
    (await sb.from("sessions").update({ status: "live" }).eq("id", row.session_id))
      .error,
    "startRound.session",
  );
  return mapRound(row);
}

export async function advanceRoundPhase(
  roundId: string,
  phase: PracticeRound["phase"],
): Promise<PracticeRound | null> {
  const sb = getServiceSupabase();
  const at = nowIso();
  const patch: Row = { phase, phase_entered_at: at };
  if (phase === "done") patch.ended_at = at;
  const row = must(
    await sb
      .from("rounds")
      .update(patch)
      .eq("id", roundId)
      .select("*")
      .maybeSingle(),
    "advanceRoundPhase",
  );
  if (!row) return null;
  if (phase === "done") {
    const siblings =
      must(
        await sb
          .from("rounds")
          .select("id, phase")
          .eq("session_id", row.session_id),
        "advanceRoundPhase.siblings",
      ) ?? [];
    const allDone = (siblings as { id: string; phase: string }[]).every(
      (r) => r.phase === "done",
    );
    if (allDone) {
      assertOk(
        (
          await sb
            .from("sessions")
            .update({ status: "ended" })
            .eq("id", row.session_id)
        ).error,
        "advanceRoundPhase.endSession",
      );
    }
  }
  return mapRound(row);
}

const OPEN_DRILL_PHASES = new Set([
  "setup",
  "presentation",
  "commentary",
  "response",
  "judges_qa",
]);

/** Resume unfinished member drill for person + mode (Supabase path). */
export async function findOpenDrillRound(opts: {
  personId: string;
  mode: PracticeMode;
  caseId?: string | null;
}): Promise<{ session: PracticeSession; round: PracticeRound } | null> {
  const sb = getServiceSupabase();
  const sessions =
    must(
      await sb
        .from("sessions")
        .select("*")
        .eq("kind", "member_practice")
        .eq("created_by", opts.personId)
        .neq("status", "ended")
        .order("created_at", { ascending: false })
        .limit(20),
      "findOpenDrillRound.sessions",
    ) ?? [];

  for (const raw of sessions as Row[]) {
    const session = mapSession(raw);
    if (session.mode && session.mode !== opts.mode) continue;
    let q = sb
      .from("rounds")
      .select("*")
      .eq("session_id", session.id)
      .eq("mode", opts.mode)
      .order("created_at", { ascending: false })
      .limit(8);
    if (opts.caseId) q = q.eq("case_id", opts.caseId);
    const rounds =
      must(await q, "findOpenDrillRound.rounds") ?? [];
    const hit = (rounds as Row[]).find((r) =>
      OPEN_DRILL_PHASES.has(String(r.phase)),
    );
    if (hit) return { session, round: mapRound(hit) };
  }
  return null;
}

export async function saveDrillCheckpoint(
  roundId: string,
  checkpoint: NonNullable<PracticeRound["drill_checkpoint"]>,
): Promise<PracticeRound | null> {
  const sb = getServiceSupabase();
  const payload = { ...checkpoint, updated_at: nowIso() };
  const row = must(
    await sb
      .from("rounds")
      .update({ drill_checkpoint: payload })
      .eq("id", roundId)
      .select("*")
      .maybeSingle(),
    "saveDrillCheckpoint",
  );
  return row ? mapRound(row) : null;
}

export async function endPracticeSession(
  sessionId: string,
  actorId: string | null,
): Promise<PracticeSession | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb
      .from("sessions")
      .update({ status: "ended" })
      .eq("id", sessionId)
      .select("*")
      .maybeSingle(),
    "endPracticeSession",
  );
  if (!row) return null;
  await logActivity({
    person_id: actorId,
    action: "session_ended",
    target: sessionId,
  });
  return mapSession(row);
}

// ---------- recordings / transcripts ----------

export async function saveRecording(row: RecordingRow): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("recordings").upsert(
        {
          id: row.id,
          round_id: row.round_id,
          chunk_paths: row.chunk_paths,
          chunk_meta: row.chunk_meta,
          status: row.status,
          deleted_at: row.deleted_at,
          transcript_job_id: row.transcript_job_id,
          created_at: row.created_at,
          created_by: row.created_by,
          owner_person_id: row.owner_person_id ?? null,
          started_at: row.started_at ?? null,
        },
        { onConflict: "id" },
      )
    ).error,
    "saveRecording",
  );
}

export async function getRecordingForRound(
  roundId: string,
  ownerPersonId?: string | null,
): Promise<RecordingRow | null> {
  const sb = getServiceSupabase();
  let q = sb
    .from("recordings")
    .select("*")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (ownerPersonId) {
    q = sb
      .from("recordings")
      .select("*")
      .eq("round_id", roundId)
      .eq("owner_person_id", ownerPersonId)
      .order("created_at", { ascending: true })
      .limit(1);
  } else if (ownerPersonId === null) {
    q = sb
      .from("recordings")
      .select("*")
      .eq("round_id", roundId)
      .is("owner_person_id", null)
      .order("created_at", { ascending: true })
      .limit(1);
  }
  const row = must(await q.maybeSingle(), "getRecordingForRound");
  return row ? mapRecording(row) : null;
}

export async function listRecordingsForRound(
  roundId: string,
): Promise<RecordingRow[]> {
  const sb = getServiceSupabase();
  const rows = must(
    await sb
      .from("recordings")
      .select("*")
      .eq("round_id", roundId)
      .order("started_at", { ascending: true }),
    "listRecordingsForRound",
  );
  return (rows as Row[]).map(mapRecording);
}

export async function saveTranscriptLines(lines: TranscriptLine[]): Promise<void> {
  if (lines.length === 0) return;
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("transcript_lines").upsert(
        lines.map((l) => ({
          id: l.id,
          round_id: l.round_id,
          start_ms: l.start_ms,
          end_ms: l.end_ms,
          speaker_person_id: l.speaker_person_id,
          speaker_label: l.speaker_label,
          text: l.text,
          corrected: l.corrected,
          created_at: l.created_at,
        })),
        { onConflict: "id" },
      )
    ).error,
    "saveTranscriptLines",
  );
}

/** Full replace for a round (finalize). Avoids orphan line ids on re-run. */
export async function replaceTranscriptForRound(
  roundId: string,
  lines: TranscriptLine[],
): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (await sb.from("transcript_lines").delete().eq("round_id", roundId)).error,
    "replaceTranscriptForRound.clear",
  );
  if (lines.length === 0) return;
  assertOk(
    (
      await sb.from("transcript_lines").insert(
        lines.map((l) => ({
          id: l.id,
          round_id: l.round_id,
          start_ms: l.start_ms,
          end_ms: l.end_ms,
          speaker_person_id: l.speaker_person_id,
          speaker_label: l.speaker_label,
          text: l.text,
          corrected: l.corrected,
          created_at: l.created_at,
        })),
      )
    ).error,
    "replaceTranscriptForRound.insert",
  );
}

export async function getTranscript(roundId: string): Promise<TranscriptLine[]> {
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("transcript_lines")
        .select("*")
        .eq("round_id", roundId)
        .order("start_ms", { ascending: true }),
      "getTranscript",
    ) ?? [];
  return rows.map(mapLine);
}

export async function getTranscriptLineById(
  lineId: string,
): Promise<TranscriptLine | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb.from("transcript_lines").select("*").eq("id", lineId).maybeSingle(),
    "getTranscriptLineById",
  );
  return row ? mapLine(row) : null;
}

export async function getGlossary(caseId: string | null): Promise<GlossaryTerm[]> {
  const sb = getServiceSupabase();
  const query = sb.from("glossary_terms").select("*");
  const rows =
    must(
      await (caseId
        ? query.or(`case_id.eq.${caseId},case_id.is.null`)
        : query.is("case_id", null)
      ).order("created_at", { ascending: true }),
      "getGlossary",
    ) ?? [];
  return rows.map(mapGlossary);
}

export async function updateGlossary(terms: GlossaryTerm[]): Promise<void> {
  if (terms.length === 0) return;
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("glossary_terms").upsert(
        terms.map((t) => ({
          id: t.id,
          case_id: t.case_id,
          term: t.term,
          misheard: t.misheard,
          pronunciation: t.pronunciation,
          created_at: t.created_at,
        })),
        { onConflict: "id" },
      )
    ).error,
    "updateGlossary",
  );
}

export async function saveSpeakerConfirm(row: SpeakerLabelConfirm): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("speaker_confirms").upsert(
        {
          round_id: row.round_id,
          mappings: row.mappings,
          confirmed_by: row.confirmed_by,
          confirmed_at: row.confirmed_at,
        },
        { onConflict: "round_id" },
      )
    ).error,
    "saveSpeakerConfirm",
  );
}

export async function getSpeakerConfirm(
  roundId: string,
): Promise<SpeakerLabelConfirm | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb
      .from("speaker_confirms")
      .select("*")
      .eq("round_id", roundId)
      .maybeSingle(),
    "getSpeakerConfirm",
  );
  if (!row) return null;
  return {
    round_id: row.round_id,
    mappings: row.mappings ?? [],
    confirmed_by: row.confirmed_by ?? null,
    confirmed_at: isoOrNull(row.confirmed_at),
  };
}

// ---------- judges ----------

export async function upsertJudge(opts: {
  name: string;
  background: string | null;
  personId: string | null;
}): Promise<JudgeRow> {
  const sb = getServiceSupabase();
  if (opts.personId) {
    const existing = must(
      await sb
        .from("judges")
        .select("*")
        .eq("person_id", opts.personId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      "upsertJudge.find",
    );
    if (existing) {
      const updated = must(
        await sb
          .from("judges")
          .update({ name: opts.name, background: opts.background })
          .eq("id", existing.id)
          .select("*")
          .single(),
        "upsertJudge.update",
      );
      return mapJudge(updated);
    }
  }
  const inserted = must(
    await sb
      .from("judges")
      .insert({
        id: randomUUID(),
        name: opts.name,
        background: opts.background,
        weight: null,
        person_id: opts.personId,
        guest_token_hash: null,
        created_at: nowIso(),
      })
      .select("*")
      .single(),
    "upsertJudge.insert",
  );
  return mapJudge(inserted);
}

export async function createGuestJudgeAccess(opts: {
  name: string;
  background: string | null;
  roundId: string;
}): Promise<{ judge: JudgeRow; token: string }> {
  const { assertGuestRoundStillOpen } = await import(
    "@/lib/ops/consent-recording"
  );
  const open = await assertGuestRoundStillOpen(opts.roundId);
  if (!open.ok) throw new Error(open.reason);

  const sb = getServiceSupabase();
  const token = generateGuestToken();
  const tokenHash = hashGuestToken(token);
  const inserted = must(
    await sb
      .from("judges")
      .insert({
        id: randomUUID(),
        name: opts.name,
        background: opts.background,
        weight: null,
        person_id: null,
        guest_token_hash: tokenHash,
        created_at: nowIso(),
      })
      .select("*")
      .single(),
    "createGuestJudgeAccess.judge",
  );
  const judge = mapJudge(inserted);
  // Soft clock backup; primary expiry is sessions.status === "ended" (F-392).
  assertOk(
    (
      await sb.from("guest_judge_tokens").insert({
        token_hash: tokenHash,
        judge_id: judge.id,
        round_id: opts.roundId,
        expires_at: addMinutes(new Date(), 12 * 60).toISOString(),
      })
    ).error,
    "createGuestJudgeAccess.token",
  );
  return { judge, token };
}

export async function resolveGuestToken(
  token: string,
): Promise<{ judge: JudgeRow; roundId: string } | null> {
  const sb = getServiceSupabase();
  const hash = hashGuestToken(token);
  const entry = must(
    await sb
      .from("guest_judge_tokens")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle(),
    "resolveGuestToken",
  );
  if (!entry) return null;
  if (new Date(entry.expires_at) < new Date()) return null;
  const { assertGuestRoundStillOpen } = await import(
    "@/lib/ops/consent-recording"
  );
  const open = await assertGuestRoundStillOpen(entry.round_id as string);
  if (!open.ok) return null;
  const judge = must(
    await sb.from("judges").select("*").eq("id", entry.judge_id).maybeSingle(),
    "resolveGuestToken.judge",
  );
  if (!judge) return null;
  return { judge: mapJudge(judge), roundId: entry.round_id as string };
}

// ---------- judging ----------

/** Find an existing human or Cruxy card for this round/team/judge (idempotent submit). */
export async function findJudgeCard(opts: {
  roundId: string;
  teamId: string;
  judgeId?: string | null;
  cruxy?: boolean;
}): Promise<JudgeCard | null> {
  const sb = getServiceSupabase();
  let q = sb
    .from("judge_cards")
    .select("*")
    .eq("round_id", opts.roundId)
    .eq("team_id", opts.teamId)
    .eq("cruxy", Boolean(opts.cruxy))
    .limit(1);
  if (opts.cruxy) {
    // Cruxy uniqueness is (round, team).
  } else if (opts.judgeId) {
    q = q.eq("judge_id", opts.judgeId);
  } else {
    return null;
  }
  const row = must(await q.maybeSingle(), "findJudgeCard");
  return row ? mapCard(row) : null;
}

export async function saveJudgeCard(
  card: JudgeCard,
  scores: CardScore[],
  opts?: { replaceScores?: boolean },
): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (await sb.from("judge_cards").upsert(cardToRow(card), { onConflict: "id" }))
      .error,
    "saveJudgeCard",
  );
  if (opts?.replaceScores) {
    assertOk(
      (await sb.from("card_scores").delete().eq("card_id", card.id)).error,
      "saveJudgeCard.replaceScores",
    );
  }
  if (scores.length > 0) {
    assertOk(
      (
        await sb
          .from("card_scores")
          .upsert(scores.map(scoreToRow), { onConflict: "id" })
      ).error,
      "saveJudgeCard.scores",
    );
  }
}

export async function listJudgeCards(
  roundId: string,
): Promise<{ cards: JudgeCard[]; scores: CardScore[] }> {
  const sb = getServiceSupabase();
  const cardRows =
    must(
      await sb
        .from("judge_cards")
        .select("*")
        .eq("round_id", roundId)
        .order("created_at", { ascending: true }),
      "listJudgeCards",
    ) ?? [];
  const cards = cardRows.map(mapCard);
  if (cards.length === 0) return { cards, scores: [] };
  const scoreRows =
    must(
      await sb
        .from("card_scores")
        .select("*")
        .in(
          "card_id",
          cards.map((c: JudgeCard) => c.id),
        )
        .order("created_at", { ascending: true }),
      "listJudgeCards.scores",
    ) ?? [];
  return { cards, scores: scoreRows.map(mapScore) };
}

export async function saveJudgmentBundle(opts: {
  cards: JudgeCard[];
  scores: CardScore[];
  feedback: FeedbackItem[];
  redos: RedoRow[];
  report: RoundReport;
}): Promise<void> {
  const sb = getServiceSupabase();
  if (opts.cards.length > 0) {
    assertOk(
      (
        await sb
          .from("judge_cards")
          .upsert(opts.cards.map(cardToRow), { onConflict: "id" })
      ).error,
      "saveJudgmentBundle.cards",
    );
    // Replace scores for these cards so re-finalize does not stack duplicates.
    const cardIds = opts.cards.map((c) => c.id);
    assertOk(
      (await sb.from("card_scores").delete().in("card_id", cardIds)).error,
      "saveJudgmentBundle.replaceScores",
    );
  }
  if (opts.scores.length > 0) {
    assertOk(
      (
        await sb
          .from("card_scores")
          .upsert(opts.scores.map(scoreToRow), { onConflict: "id" })
      ).error,
      "saveJudgmentBundle.scores",
    );
  }
  if (opts.feedback.length > 0) {
    assertOk(
      (
        await sb
          .from("feedback_items")
          .upsert(opts.feedback.map(feedbackToRow), { onConflict: "id" })
      ).error,
      "saveJudgmentBundle.feedback",
    );
  }
  if (opts.redos.length > 0) {
    assertOk(
      (
        await sb
          .from("redos")
          .upsert(opts.redos.map(redoToRow), { onConflict: "id" })
      ).error,
      "saveJudgmentBundle.redos",
    );
  }
  assertOk(
    (
      await sb.from("round_reports").upsert(
        {
          id: opts.report.id,
          round_id: opts.report.round_id,
          headline: opts.report.headline,
          socratic_followups: opts.report.socratic_followups,
          proposal_ids: opts.report.proposal_ids,
          created_at: opts.report.created_at,
        },
        { onConflict: "id" },
      )
    ).error,
    "saveJudgmentBundle.report",
  );
}

export async function getReport(roundId: string): Promise<{
  report: RoundReport | null;
  feedback: FeedbackItem[];
  redos: RedoRow[];
  cards: JudgeCard[];
  scores: CardScore[];
  lines: TranscriptLine[];
}> {
  const sb = getServiceSupabase();
  const reportRow = must(
    await sb
      .from("round_reports")
      .select("*")
      .eq("round_id", roundId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "getReport.report",
  );
  const feedbackRows =
    must(
      await sb
        .from("feedback_items")
        .select("*")
        .eq("round_id", roundId)
        .order("created_at", { ascending: true }),
      "getReport.feedback",
    ) ?? [];
  const feedback = feedbackRows.map(mapFeedback);
  let redos: RedoRow[] = [];
  if (feedback.length > 0) {
    const redoRows =
      must(
        await sb
          .from("redos")
          .select("*")
          .in(
            "feedback_item_id",
            feedback.map((f: FeedbackItem) => f.id),
          )
          .order("created_at", { ascending: true }),
        "getReport.redos",
      ) ?? [];
    redos = redoRows.map(mapRedo);
  }
  const { cards, scores } = await listJudgeCards(roundId);
  const lines = await getTranscript(roundId);
  return {
    report: reportRow ? mapReport(reportRow) : null,
    feedback,
    redos,
    cards,
    scores,
    lines,
  };
}

// ---------- bank / skills / redos ----------

export async function saveBankEntry(entry: BankEntry): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("bank_entries").upsert(
        {
          id: entry.id,
          lesson: entry.lesson,
          example_line_id: entry.example_line_id,
          why: entry.why,
          improved: entry.improved,
          drill_id: entry.drill_id,
          seen_count: entry.seen_count,
          case_id: entry.case_id,
          created_at: entry.created_at,
          created_by: entry.created_by,
        },
        { onConflict: "id" },
      )
    ).error,
    "saveBankEntry",
  );
}

export async function listBankEntries(): Promise<BankEntry[]> {
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("bank_entries")
        .select("*")
        .order("created_at", { ascending: true }),
      "listBankEntries",
    ) ?? [];
  return rows.map(mapBank);
}

export async function getSkillChart(personId: string): Promise<SkillChart | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb
      .from("skill_charts")
      .select("*")
      .eq("person_id", personId)
      .maybeSingle(),
    "getSkillChart",
  );
  if (!row) return null;
  return {
    person_id: row.person_id,
    skills: row.skills ?? {},
    updated_at: iso(row.updated_at),
  };
}

export async function saveSkillChart(chart: SkillChart): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("skill_charts").upsert(
        {
          person_id: chart.person_id,
          skills: chart.skills,
          updated_at: chart.updated_at,
        },
        { onConflict: "person_id" },
      )
    ).error,
    "saveSkillChart",
  );
}

export async function saveRedo(redo: RedoRow): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (await sb.from("redos").upsert(redoToRow(redo), { onConflict: "id" })).error,
    "saveRedo",
  );
}

export async function getRedo(id: string): Promise<RedoRow | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb.from("redos").select("*").eq("id", id).maybeSingle(),
    "getRedo",
  );
  return row ? mapRedo(row) : null;
}
