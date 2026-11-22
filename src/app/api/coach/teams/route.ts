import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { listCoachTeams } from "@/lib/coach/team-view";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (
    !person ||
    (person.role !== "coach_admin" && person.role !== "tech_admin")
  ) {
    return NextResponse.json({ error: "Coach only" }, { status: 403 });
  }
  const teams = await listCoachTeams();
  return NextResponse.json({ teams });
}
