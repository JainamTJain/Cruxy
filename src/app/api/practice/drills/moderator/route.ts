import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { pickModeratorQuestion } from "@/lib/practice/drills-extra";
import { logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    caseId?: string | null;
    sessionKey?: string;
  };
  const question = await pickModeratorQuestion({
    personId: session.personId,
    caseId: body.caseId,
    sessionKey: body.sessionKey ?? `moderator:${session.personId}`,
  });
  if (!question) {
    return NextResponse.json({
      question: null,
      message: "No active bank questions yet. Add some in the question bank first.",
    });
  }
  await logActivity({
    person_id: session.personId,
    action: "moderator_drill_question",
    target: question.id,
  });
  return NextResponse.json({
    question: {
      id: question.id,
      text: question.text,
      type: question.type,
      case_id: question.case_id,
      difficulty: question.difficulty,
    },
  });
}
