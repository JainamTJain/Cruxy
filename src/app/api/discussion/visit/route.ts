import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  isDiscussionAdmin,
  resolveDiscussionTeamId,
} from "@/lib/discussion/access";
import { markDiscussionVisit } from "@/lib/discussion/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const body = (await req.json()) as {
    caseId?: string;
    teamId?: string;
  };
  const teamId = resolveDiscussionTeamId(person, session, body.teamId ?? null);
  if (!body.caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }
  if (
    !isDiscussionAdmin(person, session) &&
    teamId !== (person.team_id ?? session.teamId)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lastSeenAt = await markDiscussionVisit({
    personId: person.id,
    teamId,
    caseId: body.caseId,
  });
  return NextResponse.json({ lastSeenAt });
}
