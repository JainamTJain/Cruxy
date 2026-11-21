import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  changesSince,
  getLastVisit,
  getPersonById,
  getProgramTotals,
  listCases,
  listCompetitions,
  listPeopleFull,
  listReadiness,
  listTeams,
  recordLastVisit,
  teamReadinessAverages,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const person = await getPersonById(session.personId);
  const lastVisit = await getLastVisit(session.personId);
  const [
    teams,
    cases,
    readiness,
    totals,
    competitions,
    people,
    avgs,
    changes,
  ] = await Promise.all([
    listTeams(),
    listCases(),
    listReadiness(),
    getProgramTotals(),
    listCompetitions(),
    listPeopleFull(),
    teamReadinessAverages(),
    changesSince(lastVisit, 15),
  ]);

  await recordLastVisit(session.personId);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const nextCompetition = competitions[0] ?? null;
  const days = nextCompetition
    ? Math.ceil(
        (new Date(nextCompetition.date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  const checklist = person?.first_run_checklist ?? {};
  const nextActions: string[] = [];
  if (!checklist.confirm_cases) nextActions.push("Confirm your cases on the first-run checklist");
  if (!checklist.open_reading) nextActions.push("Open the reading room once Track 1 lands");
  if (!person?.consent_at) nextActions.push("Finish recording consent");
  while (nextActions.length < 3) {
    nextActions.push(
      [
        "Drill one APPE item aloud this week",
        "Check Truth Sources proposals for your cases",
        "Ask Cruxy who needs help on a low-readiness case",
      ][nextActions.length]!,
    );
  }

  return NextResponse.json({
    teams,
    cases: cases.filter((c) => c.active),
    readiness,
    totals,
    teamAverages: avgs,
    competition: nextCompetition,
    daysToCompetition: days == null ? null : Math.max(0, days),
    changes: changes.map((e) => ({
      ...e,
      personName: e.person_id ? names.get(e.person_id) ?? "unknown" : "system",
    })),
    nextActions: nextActions.slice(0, 3),
    lastVisit,
  });
}
