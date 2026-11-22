/**
 * Wave 9 C: Competition Day persistence (*-extra for shared boundary).
 * Personal tools first; logistics is one plain page.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type LogisticsRow = {
  id: string;
  competition_id: string;
  schedule_text: string | null;
  departure_time: string | null;
  meeting_point: string | null;
  dress_guidance: string | null;
  venue_notes: string | null;
  room_notes: string | null;
  packing_list: string | null;
  carpool_list: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type DayRoundSpeaker = {
  role: string;
  person_id: string | null;
  name: string;
};

export type DayRoundRow = {
  id: string;
  competition_id: string;
  team_id: string;
  round_number: number;
  case_id: string | null;
  case_label: string | null;
  side: "presenting" | "commenting" | null;
  speakers: DayRoundSpeaker[];
  key_points: string[];
  room: string | null;
  starts_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type DayLogRow = {
  id: string;
  competition_id: string;
  case_id: string | null;
  case_number: number | null;
  opponent: string;
  moderator_question: string | null;
  judges_questions: string | null;
  judge_comments: string | null;
  score_us: number | null;
  score_them: number | null;
  result: "win" | "loss" | "tie" | "pending" | null;
  team_id: string | null;
  round_number: number | null;
  side: "presenting" | "commenting" | null;
  debrief_worked: string | null;
  debrief_change: string | null;
  day_round_id: string | null;
  created_at: string;
  created_by: string | null;
};

const sampleLogistics: LogisticsRow[] = [];
const sampleRounds: DayRoundRow[] = [];
const sampleLogs: DayLogRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

function normalizeLogistics(r: Record<string, unknown>): LogisticsRow {
  return {
    id: String(r.id),
    competition_id: String(r.competition_id),
    schedule_text: (r.schedule_text as string | null) ?? null,
    departure_time: (r.departure_time as string | null) ?? null,
    meeting_point: (r.meeting_point as string | null) ?? null,
    dress_guidance: (r.dress_guidance as string | null) ?? null,
    venue_notes: (r.venue_notes as string | null) ?? null,
    room_notes: (r.room_notes as string | null) ?? null,
    packing_list: (r.packing_list as string | null) ?? null,
    carpool_list: (r.carpool_list as string | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    updated_by: (r.updated_by as string | null) ?? null,
  };
}

export async function getOrCreateLogistics(
  competitionId: string,
): Promise<LogisticsRow> {
  if (isSampleDataMode()) {
    let row = sampleLogistics.find((r) => r.competition_id === competitionId);
    if (!row) {
      row = {
        id: randomUUID(),
        competition_id: competitionId,
        schedule_text: null,
        departure_time: null,
        meeting_point: null,
        dress_guidance: null,
        venue_notes: null,
        room_notes: null,
        packing_list: null,
        carpool_list: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        updated_by: null,
      };
      sampleLogistics.push(row);
    }
    return row;
  }

  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("competition_day_logistics")
    .select("*")
    .eq("competition_id", competitionId)
    .maybeSingle();
  if (existing) {
    return normalizeLogistics(existing as Record<string, unknown>);
  }
  const { data, error } = await sb
    .from("competition_day_logistics")
    .insert({ competition_id: competitionId })
    .select("*")
    .single();
  if (error) throw new Error(`getOrCreateLogistics: ${error.message}`);
  return normalizeLogistics(data as Record<string, unknown>);
}

export async function updateLogistics(input: {
  competitionId: string;
  personId: string;
  patch: Partial<{
    schedule_text: string | null;
    departure_time: string | null;
    meeting_point: string | null;
    dress_guidance: string | null;
    venue_notes: string | null;
    room_notes: string | null;
    packing_list: string | null;
    carpool_list: string | null;
  }>;
}): Promise<LogisticsRow> {
  const current = await getOrCreateLogistics(input.competitionId);
  const next: LogisticsRow = {
    ...current,
    ...input.patch,
    updated_at: nowIso(),
    updated_by: input.personId,
  };

  if (isSampleDataMode()) {
    const i = sampleLogistics.findIndex((r) => r.id === current.id);
    if (i >= 0) sampleLogistics[i] = next;
    return next;
  }

  const { data, error } = await getServiceSupabase()
    .from("competition_day_logistics")
    .update({
      schedule_text: next.schedule_text,
      departure_time: next.departure_time,
      meeting_point: next.meeting_point,
      dress_guidance: next.dress_guidance,
      venue_notes: next.venue_notes,
      room_notes: next.room_notes,
      packing_list: next.packing_list,
      carpool_list: next.carpool_list,
      updated_at: next.updated_at,
      updated_by: next.updated_by,
    })
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw new Error(`updateLogistics: ${error.message}`);
  return normalizeLogistics(data as Record<string, unknown>);
}

export async function listDayRounds(input: {
  competitionId: string;
  teamId: string;
}): Promise<DayRoundRow[]> {
  if (isSampleDataMode()) {
    return sampleRounds
      .filter(
        (r) =>
          r.competition_id === input.competitionId &&
          r.team_id === input.teamId,
      )
      .sort((a, b) => a.round_number - b.round_number);
  }
  const { data, error } = await getServiceSupabase()
    .from("competition_day_rounds")
    .select("*")
    .eq("competition_id", input.competitionId)
    .eq("team_id", input.teamId)
    .order("round_number", { ascending: true });
  if (error) throw new Error(`listDayRounds: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeDayRound);
}

function normalizeDayRound(r: Record<string, unknown>): DayRoundRow {
  return {
    id: String(r.id),
    competition_id: String(r.competition_id),
    team_id: String(r.team_id),
    round_number: Number(r.round_number),
    case_id: (r.case_id as string | null) ?? null,
    case_label: (r.case_label as string | null) ?? null,
    side: (r.side as DayRoundRow["side"]) ?? null,
    speakers: (r.speakers as DayRoundSpeaker[] | null) ?? [],
    key_points: (r.key_points as string[] | null) ?? [],
    room: (r.room as string | null) ?? null,
    starts_at: (r.starts_at as string | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    created_by: (r.created_by as string | null) ?? null,
  };
}

export async function upsertDayRound(input: {
  competitionId: string;
  teamId: string;
  roundNumber: number;
  personId: string;
  caseId?: string | null;
  caseLabel?: string | null;
  side?: "presenting" | "commenting" | null;
  speakers?: DayRoundSpeaker[];
  keyPoints?: string[];
  room?: string | null;
  startsAt?: string | null;
}): Promise<DayRoundRow> {
  const existing = (
    await listDayRounds({
      competitionId: input.competitionId,
      teamId: input.teamId,
    })
  ).find((r) => r.round_number === input.roundNumber);

  const row: DayRoundRow = {
    id: existing?.id ?? randomUUID(),
    competition_id: input.competitionId,
    team_id: input.teamId,
    round_number: input.roundNumber,
    case_id:
      input.caseId !== undefined ? input.caseId : (existing?.case_id ?? null),
    case_label:
      input.caseLabel !== undefined
        ? input.caseLabel
        : (existing?.case_label ?? null),
    side: input.side !== undefined ? input.side : (existing?.side ?? null),
    speakers:
      input.speakers !== undefined
        ? input.speakers
        : (existing?.speakers ?? []),
    key_points:
      input.keyPoints !== undefined
        ? input.keyPoints
        : (existing?.key_points ?? []),
    room: input.room !== undefined ? input.room : (existing?.room ?? null),
    starts_at:
      input.startsAt !== undefined
        ? input.startsAt
        : (existing?.starts_at ?? null),
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    created_by: existing?.created_by ?? input.personId,
  };

  if (isSampleDataMode()) {
    const i = sampleRounds.findIndex((r) => r.id === row.id);
    if (i >= 0) sampleRounds[i] = row;
    else sampleRounds.push(row);
    return row;
  }

  const { data, error } = await getServiceSupabase()
    .from("competition_day_rounds")
    .upsert(
      {
        id: row.id,
        competition_id: row.competition_id,
        team_id: row.team_id,
        round_number: row.round_number,
        case_id: row.case_id,
        case_label: row.case_label,
        side: row.side,
        speakers: row.speakers,
        key_points: row.key_points,
        room: row.room,
        starts_at: row.starts_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
      },
      { onConflict: "competition_id,team_id,round_number" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertDayRound: ${error.message}`);
  return normalizeDayRound(data as Record<string, unknown>);
}

export async function listDayLogs(input: {
  competitionId: string;
  teamId?: string | null;
}): Promise<DayLogRow[]> {
  if (isSampleDataMode()) {
    return sampleLogs
      .filter(
        (l) =>
          l.competition_id === input.competitionId &&
          (!input.teamId || l.team_id === input.teamId),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  let q = getServiceSupabase()
    .from("competition_logs")
    .select("*")
    .eq("competition_id", input.competitionId)
    .order("created_at", { ascending: false });
  if (input.teamId) q = q.eq("team_id", input.teamId);
  const { data, error } = await q;
  if (error) throw new Error(`listDayLogs: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeDayLog);
}

function normalizeDayLog(r: Record<string, unknown>): DayLogRow {
  return {
    id: String(r.id),
    competition_id: String(r.competition_id),
    case_id: (r.case_id as string | null) ?? null,
    case_number: (r.case_number as number | null) ?? null,
    opponent: String(r.opponent ?? ""),
    moderator_question: (r.moderator_question as string | null) ?? null,
    judges_questions: (r.judges_questions as string | null) ?? null,
    judge_comments: (r.judge_comments as string | null) ?? null,
    score_us: (r.score_us as number | null) ?? null,
    score_them: (r.score_them as number | null) ?? null,
    result: (r.result as DayLogRow["result"]) ?? null,
    team_id: (r.team_id as string | null) ?? null,
    round_number: (r.round_number as number | null) ?? null,
    side: (r.side as DayLogRow["side"]) ?? null,
    debrief_worked: (r.debrief_worked as string | null) ?? null,
    debrief_change: (r.debrief_change as string | null) ?? null,
    day_round_id: (r.day_round_id as string | null) ?? null,
    created_at: String(r.created_at),
    created_by: (r.created_by as string | null) ?? null,
  };
}

export async function insertDayLog(input: {
  competitionId: string;
  teamId: string;
  personId: string;
  opponent: string;
  caseId?: string | null;
  caseNumber?: number | null;
  roundNumber?: number | null;
  side?: "presenting" | "commenting" | null;
  moderatorQuestion?: string | null;
  judgesQuestions?: string | null;
  judgeComments?: string | null;
  scoreUs?: number | null;
  scoreThem?: number | null;
  result?: DayLogRow["result"];
  debriefWorked?: string | null;
  debriefChange?: string | null;
  dayRoundId?: string | null;
}): Promise<DayLogRow> {
  const row: DayLogRow = {
    id: randomUUID(),
    competition_id: input.competitionId,
    case_id: input.caseId ?? null,
    case_number: input.caseNumber ?? null,
    opponent: input.opponent.trim(),
    moderator_question: input.moderatorQuestion?.trim() || null,
    judges_questions: input.judgesQuestions?.trim() || null,
    judge_comments: input.judgeComments?.trim() || null,
    score_us: input.scoreUs ?? null,
    score_them: input.scoreThem ?? null,
    result: input.result ?? "pending",
    team_id: input.teamId,
    round_number: input.roundNumber ?? null,
    side: input.side ?? null,
    debrief_worked: input.debriefWorked?.trim() || null,
    debrief_change: input.debriefChange?.trim() || null,
    day_round_id: input.dayRoundId ?? null,
    created_at: nowIso(),
    created_by: input.personId,
  };

  if (isSampleDataMode()) {
    sampleLogs.unshift(row);
    return row;
  }

  const { data, error } = await getServiceSupabase()
    .from("competition_logs")
    .insert({
      id: row.id,
      competition_id: row.competition_id,
      case_id: row.case_id,
      case_number: row.case_number,
      opponent: row.opponent,
      moderator_question: row.moderator_question,
      judges_questions: row.judges_questions,
      judge_comments: row.judge_comments,
      score_us: row.score_us,
      score_them: row.score_them,
      result: row.result,
      team_id: row.team_id,
      round_number: row.round_number,
      side: row.side,
      debrief_worked: row.debrief_worked,
      debrief_change: row.debrief_change,
      day_round_id: row.day_round_id,
      created_at: row.created_at,
      created_by: row.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertDayLog: ${error.message}`);
  return normalizeDayLog(data as Record<string, unknown>);
}

export async function patchDayLogDebrief(input: {
  id: string;
  personId: string;
  debriefWorked: string;
  debriefChange: string;
}): Promise<DayLogRow | null> {
  if (isSampleDataMode()) {
    const i = sampleLogs.findIndex((l) => l.id === input.id);
    if (i < 0) return null;
    sampleLogs[i] = {
      ...sampleLogs[i]!,
      debrief_worked: input.debriefWorked.trim() || null,
      debrief_change: input.debriefChange.trim() || null,
    };
    return sampleLogs[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("competition_logs")
    .update({
      debrief_worked: input.debriefWorked.trim() || null,
      debrief_change: input.debriefChange.trim() || null,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`patchDayLogDebrief: ${error.message}`);
  return data ? normalizeDayLog(data as Record<string, unknown>) : null;
}
