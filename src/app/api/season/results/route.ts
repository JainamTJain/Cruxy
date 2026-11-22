import { NextResponse } from "next/server";
import { canWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listCompetitionLogs } from "@/lib/db/repository";
import {
  ensureRegionalSeason,
  saveTeamResultFromAdmin,
  summarizeLogsForTeam,
} from "@/lib/season/service";
import { listTeamResults } from "@/lib/db/supabase/season-extra";

/**
 * POST: Dr. B or Jainam enter how a USC team did.
 * Body may omit win/loss counts; then we derive from competition_logs only.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Admin view required." }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "competition_log")) {
    return NextResponse.json(
      { error: "Only Dr. B or Jainam can enter results." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    team_id?: string;
    rounds_played?: number;
    wins?: number;
    losses?: number;
    ties?: number;
    advanced?: boolean;
    advancement_note?: string | null;
    notes?: string | null;
    derive_from_logs?: boolean;
  };
  if (!body.team_id) {
    return NextResponse.json({ error: "team_id required." }, { status: 400 });
  }

  const season = await ensureRegionalSeason(person.id);
  let rounds = body.rounds_played ?? 0;
  let wins = body.wins ?? 0;
  let losses = body.losses ?? 0;
  let ties = body.ties ?? 0;
  if (body.derive_from_logs) {
    const logs = await listCompetitionLogs();
    const s = summarizeLogsForTeam(logs, body.team_id);
    rounds = s.rounds_played;
    wins = s.wins;
    losses = s.losses;
    ties = s.ties;
  }

  const row = await saveTeamResultFromAdmin({
    seasonId: season.id,
    teamId: body.team_id,
    competitionId: season.competition_id,
    rounds_played: rounds,
    wins,
    losses,
    ties,
    advanced: Boolean(body.advanced),
    advancement_note: body.advancement_note ?? null,
    notes: body.notes ?? null,
    enteredBy: person.id,
  });

  const results = await listTeamResults(season.id);
  return NextResponse.json({ result: row, results, season });
}
