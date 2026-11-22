import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { loadSeasonHub } from "@/lib/season/service";

/** GET: after-regional hub payload for the signed-in person. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  const hub = await loadSeasonHub({
    personId: session.personId,
    teamId: person?.team_id ?? session.teamId,
  });
  return NextResponse.json({
    ...hub,
    viewer: {
      personId: session.personId,
      teamId: person?.team_id ?? session.teamId,
      role: person?.role ?? session.role,
      name: person?.name ?? session.name,
      adminView: session.adminView,
    },
  });
}
