import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";
import { getRetro, upsertRetro } from "@/lib/db/supabase/season-extra";
import {
  ensureRegionalSeason,
  refreshRetroThemes,
} from "@/lib/season/service";

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
  const retro = await getRetro(season.id, teamId);
  return NextResponse.json({ season, retro });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  const body = (await req.json()) as {
    team_id?: string;
    what_worked?: string;
    what_to_change?: string;
    cases_that_landed?: string;
    arguments_that_landed?: string;
    status?: "draft" | "published";
    refresh_themes?: boolean;
  };
  const teamId = body.team_id ?? person?.team_id ?? session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "Pick a team." }, { status: 400 });
  }
  // Members write their own team; admins may write any team.
  if (
    person?.role === "member" &&
    person.team_id &&
    person.team_id !== teamId
  ) {
    return NextResponse.json(
      { error: "You can only edit your team's retro." },
      { status: 403 },
    );
  }

  const season = await ensureRegionalSeason(session.personId);
  if (season.status === "archived") {
    return NextResponse.json(
      { error: "This season is archived and read-only." },
      { status: 403 },
    );
  }

  const existing = await getRetro(season.id, teamId);
  const retro = await upsertRetro({
    season_id: season.id,
    team_id: teamId,
    what_worked: body.what_worked ?? existing?.what_worked ?? "",
    what_to_change: body.what_to_change ?? existing?.what_to_change ?? "",
    cases_that_landed:
      body.cases_that_landed ?? existing?.cases_that_landed ?? "",
    arguments_that_landed:
      body.arguments_that_landed ?? existing?.arguments_that_landed ?? "",
    status: body.status ?? existing?.status ?? "draft",
    created_by: existing?.created_by ?? session.personId,
  });

  let themes = null;
  if (body.refresh_themes) {
    themes = await refreshRetroThemes({
      seasonId: season.id,
      teamId,
      personId: session.personId,
    });
  }

  await logActivity({
    person_id: session.personId,
    action: "season_retro_saved",
    target: teamId,
    meta: { season_id: season.id, status: retro.status },
  });

  return NextResponse.json({ retro, themes });
}
