import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listTeams, getPersonById } from "@/lib/db/repository";
import { listCases, teamBoardSnapshot } from "@/lib/team/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const teamId =
    url.searchParams.get("teamId") ??
    session.teamId ??
    (await listTeams())[0]?.id;
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const [board, teams, cases, person] = await Promise.all([
    teamBoardSnapshot(teamId),
    listTeams(),
    listCases(),
    getPersonById(session.personId),
  ]);
  return NextResponse.json({
    teamId,
    teams,
    cases,
    board,
    me: {
      id: session.personId,
      name: session.name,
      teamId: session.teamId,
      role: session.role,
    },
    personName: person?.name,
  });
}
