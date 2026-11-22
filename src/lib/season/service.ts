/**
 * Wave 9 H orchestration: ensure season, sync results from logs, archive, Nationals seed.
 */
import "server-only";

import {
  getActiveSeason,
  getHandoff,
  getRetro,
  listNationalsChecklist,
  listRetroThemes,
  listSeasons,
  listTeamResults,
  markSeasonArchived,
  seedNationalsChecklist,
  upsertHandoff,
  upsertSeason,
  upsertTeamResult,
} from "@/lib/db/supabase/season-extra";
import {
  listCompetitionLogs,
  listCompetitions,
  listPeopleFull,
  listTeams,
  logActivity,
} from "@/lib/db/repository";
import { runSeasonEndExport } from "@/lib/ops/season-export";
import {
  DEFAULT_NATIONALS_CHECKLIST,
  type CompetitionTeamResult,
  type Season,
} from "@/lib/season/types";
import { buildRetroThemesFromLogs } from "@/lib/season/retro-themes";

export async function ensureRegionalSeason(actorId: string | null): Promise<Season> {
  const existing = await getActiveSeason();
  if (existing) return existing;
  const comps = await listCompetitions();
  const regional =
    comps.find((c) => /california|regional|ucsb/i.test(c.name)) ?? comps[0];
  return upsertSeason({
    label: regional?.name ?? "2026 California Regional",
    competition_id: regional?.id ?? null,
    created_by: actorId,
  });
}

/** Build win/loss/tie counts from competition_logs for a team. Never invents rows. */
export function summarizeLogsForTeam(
  logs: Awaited<ReturnType<typeof listCompetitionLogs>>,
  teamId: string,
): Pick<
  CompetitionTeamResult,
  "rounds_played" | "wins" | "losses" | "ties"
> {
  const mine = logs.filter((l) => l.team_id === teamId);
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const l of mine) {
    if (l.result === "win") wins += 1;
    else if (l.result === "loss") losses += 1;
    else if (l.result === "tie") ties += 1;
  }
  return {
    rounds_played: mine.length,
    wins,
    losses,
    ties,
  };
}

export async function loadSeasonHub(input: {
  personId: string;
  teamId: string | null;
}) {
  const season = await ensureRegionalSeason(input.personId);
  const [teams, results, logs, people] = await Promise.all([
    listTeams(),
    listTeamResults(season.id),
    listCompetitionLogs(),
    listPeopleFull(),
  ]);
  const teamId = input.teamId ?? teams[0]?.id ?? null;
  const myResult = teamId
    ? results.find((r) => r.team_id === teamId) ?? null
    : null;
  const retro = teamId ? await getRetro(season.id, teamId) : null;
  const themes = teamId ? await listRetroThemes(season.id, teamId) : [];
  let checklist = teamId
    ? await listNationalsChecklist(season.id, teamId)
    : [];
  if (teamId && myResult?.advanced && !checklist.length) {
    checklist = await seedNationalsChecklist({
      seasonId: season.id,
      teamId,
      items: DEFAULT_NATIONALS_CHECKLIST,
    });
  }
  const handoff = await getHandoff(season.id);
  const teamLogs = teamId
    ? logs.filter((l) => l.team_id === teamId)
    : [];

  return {
    season,
    teams,
    results,
    myResult,
    retro,
    themes,
    checklist,
    handoff,
    teamLogs,
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      team_id: p.team_id,
      role: p.role,
    })),
    archived: season.status === "archived",
  };
}

export async function saveTeamResultFromAdmin(input: {
  seasonId: string;
  teamId: string;
  competitionId: string | null;
  rounds_played: number;
  wins: number;
  losses: number;
  ties: number;
  advanced: boolean;
  advancement_note: string | null;
  notes: string | null;
  enteredBy: string;
}): Promise<CompetitionTeamResult> {
  const row = await upsertTeamResult({
    season_id: input.seasonId,
    competition_id: input.competitionId,
    team_id: input.teamId,
    rounds_played: input.rounds_played,
    wins: input.wins,
    losses: input.losses,
    ties: input.ties,
    advanced: input.advanced,
    advancement_note: input.advancement_note,
    notes: input.notes,
    entered_by: input.enteredBy,
  });
  if (row.advanced) {
    await seedNationalsChecklist({
      seasonId: input.seasonId,
      teamId: input.teamId,
      items: DEFAULT_NATIONALS_CHECKLIST,
    });
  }
  await logActivity({
    person_id: input.enteredBy,
    action: "competition_team_result_saved",
    target: input.teamId,
    meta: {
      season_id: input.seasonId,
      advanced: input.advanced,
      wins: input.wins,
      losses: input.losses,
    },
  });
  return row;
}

export async function refreshRetroThemes(input: {
  seasonId: string;
  teamId: string;
  personId: string;
}) {
  const logs = await listCompetitionLogs();
  return buildRetroThemesFromLogs({
    seasonId: input.seasonId,
    teamId: input.teamId,
    logs,
    personId: input.personId,
  });
}

export async function archiveSeasonAndFreeze(input: {
  seasonId: string;
  actorId: string;
}): Promise<{ season: Season; downloadPath: string | null }> {
  const seasons = await listSeasons();
  const season = seasons.find((s) => s.id === input.seasonId);
  if (!season) throw new Error("Season not found");
  if (season.status === "archived") {
    return { season, downloadPath: season.archive_storage_path };
  }
  const exportResult = await runSeasonEndExport({
    actorId: input.actorId,
    seasonLabel: season.label,
    deleteVoiceSamples: true,
    deleteOldTranscripts: false,
  });
  const archived = await markSeasonArchived({
    seasonId: input.seasonId,
    archivePath: exportResult.storagePath,
  });
  // Start a clean next season shell if none is active.
  const stillActive = await getActiveSeason();
  if (!stillActive) {
    await upsertSeason({
      label: "Next season",
      competition_id: null,
      created_by: input.actorId,
    });
  }
  await logActivity({
    person_id: input.actorId,
    action: "season_archived",
    target: input.seasonId,
    meta: { path: exportResult.storagePath },
  });
  return {
    season: archived,
    downloadPath: exportResult.downloadUrl ?? exportResult.storagePath,
  };
}

export async function ensureHandoffDraft(input: {
  seasonId: string;
  actorId: string;
}) {
  const existing = await getHandoff(input.seasonId);
  if (existing) return existing;
  const people = await listPeopleFull();
  const who = people
    .filter((p) => p.team_id)
    .map((p) => ({
      person_id: p.id,
      person_name: p.name,
      role: p.role,
      cases: "",
      notes: "",
    }));
  return upsertHandoff({
    seasonId: input.seasonId,
    body:
      "What we learned this season\n\n1. What worked in practice and at UCSB\n2. What to change next year\n3. Cases and arguments that landed\n4. How to onboard new members",
    who_did_what: who,
    updatedBy: input.actorId,
  });
}
