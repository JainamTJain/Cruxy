import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  createKudos,
  listKudosForPerson,
  listKudosForTeam,
} from "@/lib/team/calendar-repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const teamId =
    url.searchParams.get("teamId") ?? person.team_id ?? session.teamId;
  if (mine) {
    const kudos = await listKudosForPerson(person.id);
    return NextResponse.json({ kudos, meId: person.id });
  }
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const kudos = await listKudosForTeam(teamId);
  return NextResponse.json({ kudos, meId: person.id, teamId });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    toPersonId?: string;
    note?: string;
    body?: string;
    roundId?: string | null;
    caseId?: string | null;
    teamId?: string;
  };
  const teamId = body.teamId ?? person.team_id ?? session.teamId;
  if (!teamId || !body.toPersonId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  try {
    const kudos = await createKudos({
      teamId,
      fromPersonId: person.id,
      toPersonId: body.toPersonId,
      body: body.note ?? body.body ?? "",
      roundId: body.roundId,
      caseId: body.caseId,
      fromName: person.name,
    });
    return NextResponse.json({ kudos });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
