/**
 * Wave 9 C: Competition Day hub logic.
 */
import "server-only";
import { isAdminRole } from "@/lib/admin/permissions";
import { getTeamBrief } from "@/lib/db/supabase/team-brief-extra";
import {
  getOrCreateLogistics,
  insertDayLog,
  joinCarpool,
  leaveCarpool,
  listCarpools,
  listDayLogs,
  listDayRounds,
  listPackingTicks,
  patchDayLogDebrief,
  setPackingTick,
  updateLogistics,
  upsertCarpool,
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
import type { Role } from "@/lib/types";
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
      carpools: [],
      packing: { items: [] as string[], ticks: {} as Record<string, boolean> },
      rounds: [],
      logs: [],
      cases: [],
      people: [],
      teams: [],
      phases: APPE_DAY_PHASES,
      canEdit: canEditLogistics(opts.role),
      emptyLabel: EMPTY,
    };
  }

  const [logistics, carpools, cases, people, teams, rounds, logs, ticks] =
    await Promise.all([
      getOrCreateLogistics(competition.id),
      listCarpools(competition.id),
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
      opts.teamId
        ? listPackingTicks(competition.id, opts.personId)
        : Promise.resolve([]),
    ]);

  const tickMap: Record<string, boolean> = {};
  for (const t of ticks) tickMap[t.item_key] = t.done;

  const nameById = Object.fromEntries(people.map((p) => [p.id, p.name]));

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
    },
    carpools: carpools.map(({ carpool, riders }) => ({
      ...carpool,
      driver_name: nameById[carpool.driver_person_id] ?? "Driver",
      seats_left: Math.max(0, carpool.seats - 1 - riders.length),
      riders: riders.map((r) => ({
        ...r,
        name: nameById[r.person_id] ?? "Teammate",
      })),
    })),
    packing: {
      items: logistics.packing_items,
      ticks: tickMap,
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

/** Pull stance + up to three key points from Team Brief / claims for a round card. */
export async function stanceForRound(opts: {
  teamId: string;
  caseId: string | null;
}): Promise<{ thesis: string | null; keyPoints: string[] }> {
  if (!opts.caseId) return { thesis: null, keyPoints: [] };
  const brief = await getTeamBrief(opts.teamId, opts.caseId);
  const thesis = brief?.thesis?.trim() || null;

  // Prefer key points already on the day round; otherwise leave empty for editor.
  return { thesis, keyPoints: [] };
}

export async function saveLogistics(opts: {
  competitionId: string;
  personId: string;
  role: Role;
  patch: Partial<LogisticsRow>;
}) {
  if (!canEditLogistics(opts.role)) {
    throw new Error("Only Dr. B or Jainam can edit logistics.");
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
      packing_items: opts.patch.packing_items,
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

export async function offerDrive(opts: {
  competitionId: string;
  personId: string;
  seats: number;
  notes?: string | null;
}) {
  const car = await upsertCarpool({
    competitionId: opts.competitionId,
    driverPersonId: opts.personId,
    seats: opts.seats,
    notes: opts.notes,
    personId: opts.personId,
  });
  await logActivity({
    person_id: opts.personId,
    action: "competition_carpool_offered",
    target: car.id,
    meta: { seats: opts.seats },
  });
  return car;
}

export async function rideWith(opts: {
  carpoolId: string;
  personId: string;
}) {
  const rider = await joinCarpool(opts);
  await logActivity({
    person_id: opts.personId,
    action: "competition_carpool_joined",
    target: opts.carpoolId,
    meta: {},
  });
  return rider;
}

export async function leaveRide(opts: {
  carpoolId: string;
  personId: string;
}) {
  await leaveCarpool(opts);
  await logActivity({
    person_id: opts.personId,
    action: "competition_carpool_left",
    target: opts.carpoolId,
    meta: {},
  });
}

export async function tickPacking(opts: {
  competitionId: string;
  personId: string;
  itemKey: string;
  done: boolean;
}) {
  return setPackingTick(opts);
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
  // Any teammate can fill the round card; coaches can edit any team via UI team switch later.
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
  debriefWorked: string;
  debriefChange: string;
}) {
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
