import { NextResponse } from "next/server";
import { getPersonById } from "@/lib/db/repository";
import { isAdminViewer, isCaseLead } from "@/lib/ops/privacy-scope";
import { requireSession } from "@/lib/revision/api-auth";
import {
  answerQuestion,
  bestTeamAnswer,
  confirmModeratorQuestions,
  generateCruxyModeratorQuestions,
  listAnswersForQuestion,
  listQuestions,
  pasteModeratorQuestions,
  robustnessMeterForCase,
  serveQuestion,
} from "@/lib/revision/repository";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const person = await getPersonById(auth.session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId") ?? undefined;
  const teamId = url.searchParams.get("teamId") ?? undefined;
  const status = url.searchParams.get("status") as
    | "pending_confirm"
    | "active"
    | "rejected"
    | null;
  const questions = await listQuestions({
    caseId,
    status: status ?? undefined,
  });

  if (!caseId || !teamId) {
    return NextResponse.json({ questions });
  }

  const bestByQuestion: Record<string, Awaited<ReturnType<typeof bestTeamAnswer>>> =
    {};
  const answersByQuestion: Record<
    string,
    Awaited<ReturnType<typeof listAnswersForQuestion>>
  > = {};

  // Robustness aggregates stay shared. Full answer text is personal:
  // self always; case leads and admins see the team log.
  const leadOrAdmin =
    isAdminViewer(person, auth.session) ||
    (await isCaseLead({
      personId: person.id,
      teamId,
      caseId,
    }));

  for (const q of questions) {
    bestByQuestion[q.id] = await bestTeamAnswer(q.id, teamId);
    const all = await listAnswersForQuestion(q.id, teamId);
    answersByQuestion[q.id] = leadOrAdmin
      ? all
      : all.filter((a) => a.person_id === person.id);
  }

  const robustness = await robustnessMeterForCase(caseId, teamId);

  return NextResponse.json({
    questions,
    bestByQuestion,
    answersByQuestion,
    robustness,
  });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    raw?: string;
    caseId?: string | null;
    teamId?: string;
    questionIds?: string[];
    rejectIds?: string[];
    sessionKey?: string;
    preferredCaseIds?: string[];
    questionId?: string;
    text?: string;
    mode?: "typed" | "spoken";
    score?: number;
  };

  if (body.action === "paste") {
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

  if (body.action === "generate_cruxy") {
    if (!body.caseId || !body.teamId) {
      return NextResponse.json(
        { error: "caseId and teamId required" },
        { status: 400 },
      );
    }
    const questions = await generateCruxyModeratorQuestions({
      personId: auth.session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
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