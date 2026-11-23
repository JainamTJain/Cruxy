import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { pickModeratorQuestion, checkConferralSilence } from "@/lib/practice/drills-extra";
import { logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: "question" | "check";
    caseId?: string | null;
    roundId?: string;
    conferralStartMs?: number;
    conferralEndMs?: number;
  };

  if (body.action === "check") {
    if (
      !body.roundId ||
      body.conferralStartMs == null ||
      body.conferralEndMs == null
    ) {
      return NextResponse.json(
        { error: "roundId and conferral window required" },
        { status: 400 },
      );
    }
    const result = await checkConferralSilence({
      roundId: body.roundId,
      conferralStartMs: body.conferralStartMs,
      conferralEndMs: body.conferralEndMs,
    });
    await logActivity({
      person_id: session.personId,
      action: "conferral_silence_check",
      target: body.roundId,
      meta: result,
    });
    return NextResponse.json(result);
  }

  const question = await pickModeratorQuestion({
    personId: session.personId,
    caseId: body.caseId,
    sessionKey: `conferral:${session.personId}`,
  });
  if (!question) {
    return NextResponse.json({
      question: null,
      message: "No active bank questions yet.",
      conferralSeconds: 60,
    });
  }
  return NextResponse.json({
    question: {
      id: question.id,
      text: question.text,
      case_id: question.case_id,
    },
    conferralSeconds: 60,
  });
}
