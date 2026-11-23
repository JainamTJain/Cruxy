import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  listQaRouting,
  upsertQaRouting,
  QA_QUESTION_KINDS,
  type QaQuestionKind,
} from "@/lib/db/supabase/practice-drills-extra";
import {
  checkQaRoutingAnswer,
  teamMemberOptions,
} from "@/lib/practice/drills-extra";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person?.team_id) {
    return NextResponse.json({
      teamId: null,
      kinds: QA_QUESTION_KINDS,
      assignments: [],
      members: [],
    });
  }
  const [assignments, members] = await Promise.all([
    listQaRouting(person.team_id),
    teamMemberOptions(person.team_id),
  ]);
  return NextResponse.json({
    teamId: person.team_id,
    kinds: QA_QUESTION_KINDS,
    assignments,
    members,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person?.team_id) {
    return NextResponse.json({ error: "Join a team first." }, { status: 400 });
  }

  const body = (await req.json()) as {
    action?: "save" | "check";
    questionKind?: QaQuestionKind;
    personId?: string;
    speakerPersonId?: string | null;
    roundId?: string;
  };

  if (body.action === "check") {
    if (!body.questionKind || !body.roundId) {
      return NextResponse.json(
        { error: "questionKind and roundId required" },
        { status: 400 },
      );
    }
    const result = await checkQaRoutingAnswer({
      teamId: person.team_id,
      questionKind: body.questionKind,
      speakerPersonId: body.speakerPersonId ?? session.personId,
      roundId: body.roundId,
      actorId: session.personId,
    });
    return NextResponse.json(result);
  }

  if (!body.questionKind || !body.personId) {
    return NextResponse.json(
      { error: "questionKind and personId required" },
      { status: 400 },
    );
  }
  const row = await upsertQaRouting({
    teamId: person.team_id,
    questionKind: body.questionKind,
    personId: body.personId,
    actorId: session.personId,
  });
  return NextResponse.json({ ok: true, assignment: row });
}
