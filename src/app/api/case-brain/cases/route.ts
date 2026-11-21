import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listCasesForBrain } from "@/lib/case-brain/service";
import { listTeams } from "@/lib/db/repository";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const [cases, teams] = await Promise.all([listCasesForBrain(), listTeams()]);
  return NextResponse.json({
    cases,
    teams,
    myTeamId: session.teamId,
  });
}
