import { NextResponse } from "next/server";
import { isAdminViewer, isCaseLead } from "@/lib/ops/privacy-scope";
import {
  isCoachOrTech,
  requirePerson,
  resolveTeamOrDeny,
  revisionError,
} from "@/lib/revision/api-auth";
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
  const auth = await requirePerson();
  if ("error" in auth) return auth.error;
  try {
    const url = new URL(req.url);
    const caseId = url.searchParams.get("caseId") ?? undefined;
    const requestedTeam = url.searchParams.get("teamId");
    const status = url.searchParams.get("status") as
      | "pending_confirm"
      | "active"
      | "rejected"
      | null;
    const questions = await listQuestions({
      caseId,
      status: status ?? undefined,
    });

    if (!caseId || !requestedTeam) {
      return NextResponse.json({ questions });
    }

    const team = resolveTeamOrDeny(
      auth.person,
      auth.session,
      requestedTeam,
    );
    if ("error" in team) return team.error;
    const teamId = team.teamId;

    const bestByQuestion: Record<
      string,
      Awaited<ReturnType<typeof bestTeamAnswer>>
    > = {};
    const answersByQuestion: Record<
      string,
      Awaited<ReturnType<typeof listAnswersForQuestion>>
    > = {};

    const leadOrAdmin =
      isAdminViewer(auth.person, auth.session) ||
      (await isCaseLead({
        personId: auth.person.id,
        teamId,
        caseId,
      }));

    for (const q of questions) {
      bestByQuestion[q.id] = await bestTeamAnswer(q.id, teamId);
      const all = await listAnswersForQuestion(q.id, teamId);
      answersByQuestion[q.id] = leadOrAdmin
        ? all
        : all.filter((a) => a.person_id === auth.person.id);
    }

    const robustness = await robustnessMeterForCase(caseId, teamId);

    return NextResponse.json({
      questions,
      bestByQuestion,
      answersByQuestion,
      robustness,
    });
  } catch (err) {
    return revisionError(err, "Could not load the question bank. Try again.");
  }
}

export async function POST(req: Request) {
  const auth = await requirePerson();
  if ("error" in auth) return auth.error;
  try {
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
      if (!body.caseId) {
        return NextResponse.json(
          { error: "caseId required" },
          { status: 400 },
        );
      }
      const team = resolveTeamOrDeny(auth.person, auth.session, body.teamId);
      if ("error" in team) return team.error;
      const questions = await generateCruxyModeratorQuestions({
        personId: auth.session.personId,
        teamId: team.teamId,
        caseId: body.caseId,
      });
      return NextResponse.json({ questions, pending: true });
    }

    if (body.action === "confirm") {
      // Coach or tech admin confirms bank adds; members can still reject their own pending? Spec: Dr. B pastes. Members add too (F-136). Confirm is open to signed-in users who created pending rows.
      if (
        !isCoachOrTech(auth.session) &&
        (body.questionIds?.length ?? 0) === 0 &&
        (body.rejectIds?.length ?? 0) === 0
      ) {
        return NextResponse.json({ error: "Nothing to confirm" }, { status: 400 });
      }
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
      let best = null;
      if (body.teamId) {
        const team = resolveTeamOrDeny(auth.person, auth.session, body.teamId);
        if ("error" in team) return team.error;
        best = await bestTeamAnswer(body.questionId, team.teamId);
      }
      return NextResponse.json({ answer, bestTeamAnswer: best });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return revisionError(
      err,
      "Cruxy could not finish with the question bank. Try again.",
    );
  }
}
