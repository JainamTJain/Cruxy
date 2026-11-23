/**
 * Wave 9 C: Competition Day hub logic.
 * Order for the person alone: round-day card, APPE timer, log, debrief; logistics last.
 */
import "server-only";
import { isAdminRole } from "@/lib/admin/permissions";
import { canWriteTeamData } from "@/lib/auth/team-privacy";
import { getTeamBrief } from "@/lib/db/supabase/team-brief-extra";
import {
  getDayLogById,
  getOrCreateLogistics,
  insertDayLog,
  listDayLogs,
  listDayRounds,
  patchDayLogDebrief,
  updateLogistics,
  upsertDayRound,
  type DayRoundSpeaker,
  type LogisticsRow,
} from "@/lib/db/supabase/regional-extra";
import { bankCompetitionQuestions } from "@/lib/db/supabase/admin-extra";
import {
  listCases,
  listCompetitions,
  listPeopleFull,
  listTeams,
  logActivity,
} from "@/lib/db/repository";
import type { Person, Role, SessionPayload } from "@/lib/types";
import { APPE_DAY_PHASES } from "@/lib/regional/timings";

const EMPTY = "Dr. B will add this.";

export function emptyOr(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v || EMPTY;
}

export function canEditLogistics(role: Role): boolean {
  return isAdminRole(role);
}

export async function getCompetitionDayHub(opts: {
  personId: string;
  teamId: string | null;
  role: Role;
}) {
  const competitions = await listCompetitions();
  const competition =
    competitions.find((c) => c.date === "2026-12-05") ?? competitions[0] ?? null;
  if (!competition) {
    return {
      competition: null,
      logistics: null,
      rounds: [],
      logs: [],
      cases: [],
      people: [],
      teams: [],
      phases: APPE_DAY_PHASES,
      canEdit: canEditLogistics(opts.role),
      emptyLabel: EMPTY,
      viewer: {
        personId: opts.personId,
        teamId: opts.teamId,
        role: opts.role,
      },
    };
  }

  const [logistics, cases, people, teams, rounds, logs] = await Promise.all([
    getOrCreateLogistics(competition.id),
    listCases(),
    listPeopleFull(),
    listTeams(),
    opts.teamId
      ? listDayRounds({
          competitionId: competition.id,
          teamId: opts.teamId,
        })
      : Promise.resolve([]),
    listDayLogs({
      competitionId: competition.id,
      teamId: opts.teamId,
    }),
  ]);

  return {
    competition,
    logistics: {
      ...logistics,
      schedule_display: emptyOr(logistics.schedule_text),
      departure_display: emptyOr(logistics.departure_time),
      meeting_display: emptyOr(logistics.meeting_point),
      dress_display: emptyOr(logistics.dress_guidance),
      venue_display: emptyOr(logistics.venue_notes),
      room_display: emptyOr(logistics.room_notes),
      packing_display: emptyOr(logistics.packing_list),
      carpool_display: emptyOr(logistics.carpool_list),
    },
    rounds,
    logs,
    cases: cases.filter((c) => c.active),
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      team_id: p.team_id,
    })),
    teams,
    phases: APPE_DAY_PHASES,
    canEdit: canEditLogistics(opts.role),
    emptyLabel: EMPTY,
    viewer: {
      personId: opts.personId,
      teamId: opts.teamId,
      role: opts.role,
    },
  };
}

export async function saveLogistics(opts: {
  competitionId: string;
  personId: string;
  role: Role;
  patch: Partial<LogisticsRow>;
}) {
  if (!canEditLogistics(opts.role)) {
    throw new Error("Only Dr. B or Jainam can edit the day page.");
  }
  const row = await updateLogistics({
    competitionId: opts.competitionId,
    personId: opts.personId,
    patch: {
      schedule_text: opts.patch.schedule_text,
      departure_time: opts.patch.departure_time,
      meeting_point: opts.patch.meeting_point,
      dress_guidance: opts.patch.dress_guidance,
      venue_notes: opts.patch.venue_notes,
      room_notes: opts.patch.room_notes,
      packing_list: opts.patch.packing_list,
      carpool_list: opts.patch.carpool_list,
    },
  });
  await logActivity({
    person_id: opts.personId,
    action: "competition_day_logistics_updated",
    target: row.id,
    meta: { competitionId: opts.competitionId },
  });
  return row;
}

export async function saveDayRound(opts: {
  competitionId: string;
  teamId: string;
  personId: string;
  role: Role;
  roundNumber: number;
  caseId?: string | null;
  caseLabel?: string | null;
  side?: "presenting" | "commenting" | null;
  speakers?: DayRoundSpeaker[];
  keyPoints?: string[];
  room?: string | null;
  startsAt?: string | null;
}) {
  const row = await upsertDayRound(opts);
  await logActivity({
    person_id: opts.personId,
    action: "competition_day_round_saved",
    target: row.id,
    meta: { round: opts.roundNumber },
  });
  return row;
}

export async function logRealRound(opts: {
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
  result?: "win" | "loss" | "tie" | "pending" | null;
  debriefWorked?: string | null;
  debriefChange?: string | null;
  dayRoundId?: string | null;
}) {
  if (!opts.opponent.trim()) {
    throw new Error("Name the opponent school.");
  }
  const row = await insertDayLog(opts);
  if (opts.moderatorQuestion || opts.judgesQuestions) {
    await bankCompetitionQuestions({
      actorId: opts.personId,
      caseId: opts.caseId ?? null,
      moderatorQuestion: opts.moderatorQuestion,
      judgesQuestions: opts.judgesQuestions,
      logId: row.id,
    });
  }
  await logActivity({
    person_id: opts.personId,
    action: "competition_day_round_logged",
    target: row.id,
    meta: { opponent: row.opponent, round: row.round_number },
  });
  return row;
}

export async function saveDebrief(opts: {
  logId: string;
  personId: string;
  person: Pick<Person, "team_id" | "role">;
  session: Pick<SessionPayload, "teamId" | "adminView" | "role">;
  debriefWorked: string;
  debriefChange: string;
}) {
  const existing = await getDayLogById(opts.logId);
  if (!existing) throw new Error("Could not find that round log.");
  if (
    !existing.team_id ||
    !canWriteTeamData(opts.person, opts.session, existing.team_id)
  ) {
    throw new Error("That round log belongs to another team.");
  }
  const row = await patchDayLogDebrief({
    id: opts.logId,
    personId: opts.personId,
    debriefWorked: opts.debriefWorked,
    debriefChange: opts.debriefChange,
  });
  if (!row) throw new Error("Could not find that round log.");
  await logActivity({
    person_id: opts.personId,
    action: "competition_day_debrief_saved",
    target: row.id,
    meta: {},
  });
  return row;
}

/** Optional helper if a caller wants the Team Brief thesis for a case. */
export async function stanceForRound(opts: {
  teamId: string;
  caseId: string | null;
}): Promise<{ thesis: string | null }> {
  if (!opts.caseId) return { thesis: null };
  const brief = await getTeamBrief(opts.teamId, opts.caseId);
  return { thesis: brief?.thesis?.trim() || null };
}
