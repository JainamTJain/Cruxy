import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { getRoundById } from "@/lib/db/practice-repository";
import { extractFreeRecordIdeas } from "@/lib/practice/drills-extra";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person?.team_id) {
    return NextResponse.json(
      { error: "Join a team before free record." },
      { status: 400 },
    );
  }
  const body = (await req.json()) as { roundId?: string };
  if (!body.roundId) {
    return NextResponse.json({ error: "roundId required" }, { status: 400 });
  }
  const round = await getRoundById(body.roundId);
  if (!round?.case_id) {
    return NextResponse.json(
      { error: "Round needs a case before ideas can be saved." },
      { status: 400 },
    );
  }
  const result = await extractFreeRecordIdeas({
    personId: person.id,
    teamId: person.team_id,
    caseId: round.case_id,
    roundId: round.id,
  });
  return NextResponse.json(result);
}
