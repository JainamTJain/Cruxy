import { NextResponse } from "next/server";
import { requireSession } from "@/lib/revision/api-auth";
import {
  getRoadmapView,
  recordJudgeAttempt,
  recordMapReview,
  recordPracticeSpeak,
  recordReadingProgress,
} from "@/lib/revision/repository";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const view = await getRoadmapView(auth.session.personId);
  return NextResponse.json(view);
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    caseId?: string;
    teamId?: string;
    fileId?: string;
    openedRatio?: number;
    claimId?: string;
    score?: number;
  };

  if (body.action === "reading" && body.caseId && body.fileId) {
    await recordReadingProgress({
      personId: auth.session.personId,
      caseId: body.caseId,
      fileId: body.fileId,
      openedRatio: body.openedRatio ?? 0.7,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "map_review" && body.caseId && body.teamId) {
    await recordMapReview({
      personId: auth.session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
      claimId: body.claimId,
      kind: body.claimId ? "reviewed" : "reviewed_all",
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "practiced" && body.caseId) {
    await recordPracticeSpeak({
      personId: auth.session.personId,
      caseId: body.caseId,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "judged" && body.caseId && body.score != null) {
    await recordJudgeAttempt({
      personId: auth.session.personId,
      caseId: body.caseId,
      score: body.score,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
