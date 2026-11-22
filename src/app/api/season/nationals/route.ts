import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";
import {
  listNationalsChecklist,
  listTeamResults,
  updateNationalsChecklistItem,
} from "@/lib/db/supabase/season-extra";
import { ensureRegionalSeason } from "@/lib/season/service";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  const url = new URL(req.url);
  const teamId =
    url.searchParams.get("teamId") ??
    person?.team_id ??
    session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "Pick a team." }, { status: 400 });
  }
  const season = await ensureRegionalSeason(session.personId);
  const results = await listTeamResults(season.id);
  const mine = results.find((r) => r.team_id === teamId) ?? null;
  if (!mine?.advanced) {
    return NextResponse.json({
      season,
      advanced: false,
      checklist: [],
      message: "Nationals prep opens when Dr. B or Jainam records that this team advanced.",
    });
  }
  const checklist = await listNationalsChecklist(season.id, teamId);
  return NextResponse.json({
    season,
    advanced: true,
    result: mine,
    checklist,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const season = await ensureRegionalSeason(session.personId);
  if (season.status === "archived") {
    return NextResponse.json(
      { error: "This season is archived and read-only." },
      { status: 403 },
    );
  }
  const body = (await req.json()) as { id?: string; done?: boolean };
  if (!body.id || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "id and done required." }, { status: 400 });
  }
  const item = await updateNationalsChecklistItem({
    id: body.id,
    done: body.done,
  });
  await logActivity({
    person_id: session.personId,
    action: "nationals_checklist_toggled",
    target: item.id,
    meta: { done: item.done },
  });
  return NextResponse.json({ item });
}
