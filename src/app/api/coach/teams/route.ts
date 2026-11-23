import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth/require-session";
import { getPersonById } from "@/lib/db/repository";
import { listCoachTeams } from "@/lib/coach/team-view";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireAdmin(auth.session);
  if (denied) return denied;
  const person = await getPersonById(auth.session.personId);
  if (
    !person ||
    (person.role !== "coach_admin" && person.role !== "tech_admin")
  ) {
    return NextResponse.json({ error: "Coach only" }, { status: 403 });
  }
  const teams = await listCoachTeams();
  return NextResponse.json({ teams });
}
