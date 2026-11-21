import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  getTeamChampion,
  setTeamChampion,
} from "@/lib/db/supabase/auth-extra";
import {
  listIncompleteChecklistsForTeam,
  nudgeChampionForIncomplete,
} from "@/lib/auth/first-run";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const championId = await getTeamChampion(session.teamId);
  const incomplete = await listIncompleteChecklistsForTeam(session.teamId);
  return NextResponse.json({ championId, incomplete });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person?.team_id) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const body = (await req.json()) as {
    action?: "set" | "nudge";
    championPersonId?: string | null;
    teammateId?: string;
  };

  if (body.action === "nudge" && body.teammateId) {
    await nudgeChampionForIncomplete(person.team_id, body.teammateId);
    return NextResponse.json({ ok: true });
  }

  // Any teammate can set the champion (chosen by the team).
  await setTeamChampion({
    actorId: session.personId,
    teamId: person.team_id,
    championPersonId: body.championPersonId ?? session.personId,
  });
  return NextResponse.json({ ok: true });
}
