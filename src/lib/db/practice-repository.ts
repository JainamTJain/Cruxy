import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import * as sb from "@/lib/db/supabase/practice";
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
} from "@/lib/practice/session-codes";
import { buildCaseGlossary } from "@/lib/practice/glossary";
import {
  afterBankEntrySaved,
  afterFeedbackSaved,
  afterJudgeCardSaved,
} from "@/lib/graph/after-writes";
import { nowIso, addMinutes } from "@/lib/utils";

export async function listCases() {
  if (!isSampleDataMode()) return sb.listCases();
  const store = await readStore();
  return store.cases;
}

export async function listSessions(opts?: {
  forPersonId?: string;
  admin?: boolean;
}): Promise<
  (PracticeSession & { code?: string | null; rounds: PracticeRound[] })[]
> {
  if (!isSampleDataMode()) return sb.listSessions(opts);
  const store = await readStore();
  const rounds = store.practice_rounds;
  return store.practice_sessions.map((s) => ({
    ...s,
    code: opts?.admin ? null : undefined, // never return hash as code
    code_hash: opts?.admin ? s.code_hash : null,
    rounds: rounds.filter((r) => r.session_id === s.id),
  }));
}

export async function getSessionById(
  id: string,
): Promise<(PracticeSession & { rounds: PracticeRound[] }) | null> {
  if (!isSampleDataMode()) return sb.getSessionById(id);
  const store = await readStore();
  const s = store.practice_sessions.find((x) => x.id === id);
  if (!s) return null;
  return {
    ...s,
    rounds: store.practice_rounds.filter((r) => r.session_id === id),
  };
}

export async function getRoundById(
  id: string,
): Promise<(PracticeRound & { session: PracticeSession }) | null> {
  if (!isSampleDataMode()) return sb.getRoundById(id);
  const store = await readStore();
  const round = store.practice_rounds.find((r) => r.id === id);
  if (!round) return null;
  const session = store.practice_sessions.find((s) => s.id === round.session_id);
  if (!session) return null;
  return { ...round, session };
}

export type CreateSessionInput = {
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
  if (!isSampleDataMode()) return sb.createSession(input);
  const plainCode =
    input.kind === "admin" ? generateSessionCode() : generateSessionCode();
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
  }));

  await updateStore((s) => {
    s.practice_sessions.push(session);
    s.practice_rounds.push(...rounds);
    s.session_admin_codes[session.id] = plainCode;
    for (const round of rounds) {
      if (round.case_id) {
        const caseRow = s.cases.find((c) => c.id === round.case_id);
        const glossary = buildCaseGlossary({
          caseId: round.case_id,
          caseTitle: caseRow?.title,
        });
        // avoid dupes
        for (const g of glossary) {
          if (
            !s.glossary.some(
              (x) =>
                x.case_id === g.case_id &&
                x.term.toLowerCase() === g.term.toLowerCase(),
            )
          ) {
            s.glossary.push(g);
          }
        }
      }
    }
  });

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
  if (!isSampleDataMode()) return sb.rotateSessionCode(sessionId, adminId);
  const plain = generateSessionCode();
  const hash = await hashSessionCode(plain);
  await updateStore((s) => {
    const session = s.practice_sessions.find((x) => x.id === sessionId);
    if (session) session.code_hash = hash;
  });
  await logActivity({
    person_id: adminId,
    action: "session_code_rotated",
    target: sessionId,
  });
  return plain;
}

export async function joinWithSessionCode(opts: {
  code: string;
  personId?: string | null;
  ipKey?: string;
  /** Judging portal vs practice-room join (Workstream I portal_attempts). */
  portal?: "judging" | "session_code";
}): Promise<
  | { ok: true; session: PracticeSession; rounds: PracticeRound[] }
  | { ok: false; reason: string }
> {
  // Workstream I owns brute-force; D routes through practice-extra.
  const { joinWithSessionCodeGuarded } = await import(
    "@/lib/db/supabase/practice-extra"
  );
  return joinWithSessionCodeGuarded(opts);
}

export async function upsertAttendance(opts: {
  sessionId: string;
  personId: string;
  status: AttendanceStatus;
  source: AttendanceRow["source"];
}): Promise<AttendanceRow> {
  if (!isSampleDataMode()) return sb.upsertAttendance(opts);
  let row!: AttendanceRow;
  await updateStore((s) => {
    const existing = s.attendance.find(
      (a) => a.session_id === opts.sessionId && a.person_id === opts.personId,
    );
    if (existing) {
      existing.status = opts.status;
      existing.source = opts.source;
      row = existing;
    } else {
      row = {
        id: randomUUID(),
        session_id: opts.sessionId,
        person_id: opts.personId,
        status: opts.status,
        source: opts.source,
        created_at: nowIso(),
      };
      s.attendance.push(row);
    }
  });
  return row;
}

export async function listAttendance(sessionId: string) {
  if (!isSampleDataMode()) return sb.listAttendance(sessionId);
  const store = await readStore();
  return store.attendance.filter((a) => a.session_id === sessionId);
}

export async function startRound(roundId: string): Promise<PracticeRound | null> {
  if (!isSampleDataMode()) return sb.startRound(roundId);
  let round: PracticeRound | null = null;
  await updateStore((s) => {
    const r = s.practice_rounds.find((x) => x.id === roundId);
    if (!r) return;
    r.phase = "presentation";
    r.started_at = nowIso();
    const session = s.practice_sessions.find((x) => x.id === r.session_id);
    if (session) session.status = "live";
    round = { ...r };
  });
  return round;
}

export async function advanceRoundPhase(
  roundId: string,
  phase: PracticeRound["phase"],
): Promise<PracticeRound | null> {
  if (!isSampleDataMode()) return sb.advanceRoundPhase(roundId, phase);
  let round: PracticeRound | null = null;
  await updateStore((s) => {
    const r = s.practice_rounds.find((x) => x.id === roundId);
    if (!r) return;
    r.phase = phase;
    if (phase === "done") {
      r.ended_at = nowIso();
      const siblings = s.practice_rounds.filter(
        (x) => x.session_id === r.session_id,
      );
      if (siblings.every((x) => x.phase === "done" || x.id === r.id)) {
        const session = s.practice_sessions.find((x) => x.id === r.session_id);
        if (session) session.status = "ended";
      }
    }
    round = { ...r };
  });
  return round;
}

/** Mark a practice session ended so guest links and codes stop working (F-392). */
export async function endPracticeSession(
  sessionId: string,
  actorId: string | null,
): Promise<PracticeSession | null> {
  if (!isSampleDataMode()) return sb.endPracticeSession(sessionId, actorId);
  let session: PracticeSession | null = null;
  await updateStore((s) => {
    const row = s.practice_sessions.find((x) => x.id === sessionId);
    if (!row) return;
    row.status = "ended";
    session = { ...row };
  });
  if (session) {
    await logActivity({
      person_id: actorId,
      action: "session_ended",
      target: sessionId,
    });
  }
  return session;
}

export async function saveRecording(row: RecordingRow) {
  if (!isSampleDataMode()) return sb.saveRecording(row);
  await updateStore((s) => {
    const i = s.recordings.findIndex((r) => r.id === row.id);
    if (i >= 0) s.recordings[i] = row;
    else s.recordings.push(row);
  });
}

export async function getRecordingForRound(
  roundId: string,
  ownerPersonId?: string | null,
): Promise<RecordingRow | null> {
  if (!isSampleDataMode()) return sb.getRecordingForRound(roundId, ownerPersonId);
  const store = await readStore();
  const rows = store.recordings.filter((r) => r.round_id === roundId);
  if (ownerPersonId) {
    return rows.find((r) => r.owner_person_id === ownerPersonId) ?? null;
  }
  if (ownerPersonId === null) {
    return rows.find((r) => !r.owner_person_id) ?? null;
  }
  return rows[0] ?? null;
}

export async function listRecordingsForRound(
  roundId: string,
): Promise<RecordingRow[]> {
  if (!isSampleDataMode()) return sb.listRecordingsForRound(roundId);
  const store = await readStore();
  return store.recordings
    .filter((r) => r.round_id === roundId)
    .sort((a, b) =>
      String(a.started_at ?? a.created_at).localeCompare(
        String(b.started_at ?? b.created_at),
      ),
    );
}

export async function saveTranscriptLines(lines: TranscriptLine[]) {
  if (!isSampleDataMode()) return sb.saveTranscriptLines(lines);
  await updateStore((s) => {
    for (const line of lines) {
      const i = s.transcript_lines.findIndex((l) => l.id === line.id);
      if (i >= 0) s.transcript_lines[i] = line;
      else s.transcript_lines.push(line);
    }
  });
}

export async function getTranscript(roundId: string): Promise<TranscriptLine[]> {
  if (!isSampleDataMode()) return sb.getTranscript(roundId);
  const store = await readStore();
  return store.transcript_lines
    .filter((l) => l.round_id === roundId)
    .sort((a, b) => a.start_ms - b.start_ms);
}

export async function getTranscriptLineById(
  lineId: string,
): Promise<TranscriptLine | null> {
  if (!isSampleDataMode()) return sb.getTranscriptLineById(lineId);
  const store = await readStore();
  return store.transcript_lines.find((l) => l.id === lineId) ?? null;
}

export async function getGlossary(caseId: string | null): Promise<GlossaryTerm[]> {
  if (!isSampleDataMode()) return sb.getGlossary(caseId);
  const store = await readStore();
  return store.glossary.filter(
    (g) => g.case_id === caseId || g.case_id === null,
  );
}

export async function updateGlossary(terms: GlossaryTerm[]) {
  if (!isSampleDataMode()) return sb.updateGlossary(terms);
  await updateStore((s) => {
    for (const t of terms) {
      const i = s.glossary.findIndex((g) => g.id === t.id);
      if (i >= 0) s.glossary[i] = t;
      else s.glossary.push(t);
    }
  });
}

export async function saveSpeakerConfirm(row: SpeakerLabelConfirm) {
  if (!isSampleDataMode()) return sb.saveSpeakerConfirm(row);
  await updateStore((s) => {
    const i = s.speaker_confirms.findIndex((x) => x.round_id === row.round_id);
    if (i >= 0) s.speaker_confirms[i] = row;
    else s.speaker_confirms.push(row);
  });
}

export async function getSpeakerConfirm(
  roundId: string,
): Promise<SpeakerLabelConfirm | null> {
  if (!isSampleDataMode()) return sb.getSpeakerConfirm(roundId);
  const store = await readStore();
  return store.speaker_confirms.find((x) => x.round_id === roundId) ?? null;
}

export async function upsertJudge(opts: {
  name: string;
  background: string | null;
  personId: string | null;
}): Promise<JudgeRow> {
  if (!isSampleDataMode()) return sb.upsertJudge(opts);
  let judge!: JudgeRow;
  await updateStore((s) => {
    if (opts.personId) {
      const existing = s.judges.find((j) => j.person_id === opts.personId);
      if (existing) {
        existing.name = opts.name;
        existing.background = opts.background;
        judge = existing;
        return;
      }
    }
    judge = {
      id: randomUUID(),
      name: opts.name,
      background: opts.background,
      weight: null,
      person_id: opts.personId,
      guest_token_hash: null,
      created_at: nowIso(),
    };
    s.judges.push(judge);
  });
  return judge;
}

export async function createGuestJudgeAccess(opts: {
  name: string;
  background: string | null;
  roundId: string;
}): Promise<{ judge: JudgeRow; token: string }> {
  if (!isSampleDataMode()) return sb.createGuestJudgeAccess(opts);
  const open = await import("@/lib/ops/consent-recording").then((m) =>
    m.assertGuestRoundStillOpen(opts.roundId),
  );
  if (!open.ok) throw new Error(open.reason);
  const token = generateGuestToken();
  const tokenHash = hashGuestToken(token);
  const judge: JudgeRow = {
    id: randomUUID(),
    name: opts.name,
    background: opts.background,
    weight: null,
    person_id: null,
    guest_token_hash: tokenHash,
    created_at: nowIso(),
  };
  // Soft clock backup; primary expiry is session.status === "ended".
  await updateStore((s) => {
    s.judges.push(judge);
    s.guest_judge_tokens.push({
      token_hash: tokenHash,
      judge_id: judge.id,
      round_id: opts.roundId,
      expires_at: addMinutes(new Date(), 12 * 60).toISOString(),
    });
  });
  return { judge, token };
}

export async function resolveGuestToken(
  token: string,
): Promise<{ judge: JudgeRow; roundId: string } | null> {
  if (!isSampleDataMode()) return sb.resolveGuestToken(token);
  const hash = hashGuestToken(token);
  const store = await readStore();
  const entry = store.guest_judge_tokens.find((t) => t.token_hash === hash);
  if (!entry) return null;
  if (new Date(entry.expires_at) < new Date()) return null;
  const open = await import("@/lib/ops/consent-recording").then((m) =>
    m.assertGuestRoundStillOpen(entry.round_id),
  );
  if (!open.ok) return null;
  const judge = store.judges.find((j) => j.id === entry.judge_id);
  if (!judge) return null;
  return { judge, roundId: entry.round_id };
}

export async function saveJudgeCard(
  card: JudgeCard,
  scores: CardScore[],
) {
  if (!isSampleDataMode()) {
    await sb.saveJudgeCard(card, scores);
    await afterJudgeCardSaved(card);
    return;
  }
  await updateStore((s) => {
    const i = s.judge_cards.findIndex((c) => c.id === card.id);
    if (i >= 0) s.judge_cards[i] = card;
    else s.judge_cards.push(card);
    for (const score of scores) {
      const si = s.card_scores.findIndex((x) => x.id === score.id);
      if (si >= 0) s.card_scores[si] = score;
      else s.card_scores.push(score);
    }
  });
  await afterJudgeCardSaved(card);
}

export async function listJudgeCards(roundId: string) {
  if (!isSampleDataMode()) return sb.listJudgeCards(roundId);
  const store = await readStore();
  const cards = store.judge_cards.filter((c) => c.round_id === roundId);
  const scores = store.card_scores.filter((s) =>
    cards.some((c) => c.id === s.card_id),
  );
  return { cards, scores };
}

export async function saveJudgmentBundle(opts: {
  cards: JudgeCard[];
  scores: CardScore[];
  feedback: FeedbackItem[];
  redos: RedoRow[];
  report: RoundReport;
}) {
  if (!isSampleDataMode()) {
    await sb.saveJudgmentBundle(opts);
    for (const c of opts.cards) await afterJudgeCardSaved(c);
    await afterFeedbackSaved(opts.feedback);
    return;
  }
  await updateStore((s) => {
    for (const c of opts.cards) {
      const i = s.judge_cards.findIndex((x) => x.id === c.id);
      if (i >= 0) s.judge_cards[i] = c;
      else s.judge_cards.push(c);
    }
    for (const sc of opts.scores) {
      const i = s.card_scores.findIndex((x) => x.id === sc.id);
      if (i >= 0) s.card_scores[i] = sc;
      else s.card_scores.push(sc);
    }
    for (const f of opts.feedback) {
      const i = s.feedback_items.findIndex((x) => x.id === f.id);
      if (i >= 0) s.feedback_items[i] = f;
      else s.feedback_items.push(f);
    }
    for (const r of opts.redos) {
      const i = s.redos.findIndex((x) => x.id === r.id);
      if (i >= 0) s.redos[i] = r;
      else s.redos.push(r);
    }
    const ri = s.round_reports.findIndex((x) => x.id === opts.report.id);
    if (ri >= 0) s.round_reports[ri] = opts.report;
    else s.round_reports.push(opts.report);
  });
  for (const c of opts.cards) await afterJudgeCardSaved(c);
  await afterFeedbackSaved(opts.feedback);
}

export async function getReport(roundId: string) {
  if (!isSampleDataMode()) return sb.getReport(roundId);
  const store = await readStore();
  const report = store.round_reports.find((r) => r.round_id === roundId) ?? null;
  const feedback = store.feedback_items.filter((f) => f.round_id === roundId);
  const redos = store.redos.filter((r) =>
    feedback.some((f) => f.id === r.feedback_item_id),
  );
  const { cards, scores } = await listJudgeCards(roundId);
  const lines = store.transcript_lines.filter((l) => l.round_id === roundId);
  return { report, feedback, redos, cards, scores, lines };
}

export async function saveBankEntry(entry: BankEntry) {
  if (!isSampleDataMode()) {
    await sb.saveBankEntry(entry);
    await afterBankEntrySaved(entry);
    return;
  }
  await updateStore((s) => {
    s.bank_entries.push(entry);
  });
  await afterBankEntrySaved(entry);
}

export async function listBankEntries() {
  if (!isSampleDataMode()) return sb.listBankEntries();
  const store = await readStore();
  return store.bank_entries;
}

export async function getSkillChart(personId: string): Promise<SkillChart | null> {
  if (!isSampleDataMode()) return sb.getSkillChart(personId);
  const store = await readStore();
  return store.skill_charts.find((c) => c.person_id === personId) ?? null;
}

export async function saveSkillChart(chart: SkillChart) {
  if (!isSampleDataMode()) return sb.saveSkillChart(chart);
  await updateStore((s) => {
    const i = s.skill_charts.findIndex((c) => c.person_id === chart.person_id);
    if (i >= 0) s.skill_charts[i] = chart;
    else s.skill_charts.push(chart);
  });
}

export async function saveRedo(redo: RedoRow) {
  if (!isSampleDataMode()) return sb.saveRedo(redo);
  await updateStore((s) => {
    const i = s.redos.findIndex((r) => r.id === redo.id);
    if (i >= 0) s.redos[i] = redo;
    else s.redos.push(redo);
  });
}

export async function getRedo(id: string): Promise<RedoRow | null> {
  if (!isSampleDataMode()) return sb.getRedo(id);
  const store = await readStore();
  return store.redos.find((r) => r.id === id) ?? null;
}
