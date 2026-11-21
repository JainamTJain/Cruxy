import { NextResponse } from "next/server";
import { requireSession } from "@/lib/revision/api-auth";
import {
  answerQuestion,
  bestTeamAnswer,
  confirmModeratorQuestions,
  listQuestions,
  pasteModeratorQuestions,
  serveQuestion,
} from "@/lib/revision/repository";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId") ?? undefined;
  const status = url.searchParams.get("status") as
    | "pending_confirm"
    | "active"
    | "rejected"
    | null;
  const questions = await listQuestions({
    caseId,
    status: status ?? undefined,
  });
  return NextResponse.json({ questions });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    raw?: string;
    caseId?: string | null;
    questionIds?: string[];
    rejectIds?: string[];
    sessionKey?: string;
    preferredCaseIds?: string[];
    questionId?: string;
    text?: string;
    mode?: "typed" | "spoken";
    score?: number;
    teamId?: string;
  };

  if (body.action === "paste") {
    // Spec: Dr. B adds freely; members can add too. Any signed-in user.
    if (!body.raw?.trim()) {
      return NextResponse.json({ error: "raw text required" }, { status: 400 });
    }
    const origin =
      auth.session.name === "Dr. B" || auth.session.role === "coach_admin"
        ? "dr_b"
        : "member";
    const questions = await pasteModeratorQuestions({
      raw: body.raw,
      caseId: body.caseId ?? null,
      personId: auth.session.personId,
      origin,
    });
    return NextResponse.json({ questions, pending: true });
  }

  if (body.action === "confirm") {
    await confirmModeratorQuestions({
      questionIds: body.questionIds ?? [],
      rejectIds: body.rejectIds,
      personId: auth.session.personId,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "serve") {
    const q = await serveQuestion({
      personId: auth.session.personId,
      sessionKey: body.sessionKey ?? `drill-${auth.session.personId}`,
      preferredCaseIds: body.preferredCaseIds,
    });
    return NextResponse.json({ question: q });
  }

  if (body.action === "answer") {
    if (!body.questionId || !body.text?.trim()) {
      return NextResponse.json(
        { error: "questionId and text required" },
        { status: 400 },
      );
    }
    const answer = await answerQuestion({
      questionId: body.questionId,
      personId: auth.session.personId,
      text: body.text,
      mode: body.mode,
      score: body.score,
    });
    const best = body.teamId
      ? await bestTeamAnswer(body.questionId, body.teamId)
      : null;
    return NextResponse.json({ answer, bestTeamAnswer: best });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
