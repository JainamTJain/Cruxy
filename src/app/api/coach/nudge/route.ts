import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { sendCoachNudge } from "@/lib/coach/team-view";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
  const body = (await req.json()) as {
    personId?: string;
    teamId?: string;
    note?: string;
  };
  if (!body.personId || !body.teamId) {
    return NextResponse.json(
      { error: "Missing personId or teamId" },
      { status: 400 },
    );
  }
  const result = await sendCoachNudge({
    actorId: session.personId,
    personId: body.personId,
    teamId: body.teamId,
    note: body.note,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: "Nudge sent." });
}
