import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  generateSoloMockCommentary,
  generateSoloMockJudges,
  scoreSoloMockRound,
  startSoloMockRound,
} from "@/lib/team/solo-mock";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?:
      | "start"
      | "commentary"
      | "judges"
      | "score";
    caseId?: string | null;
    roundId?: string;
    caseTitle?: string;
    caseNumber?: number | null;
    presentationNotes?: string;
    fallbackNotes?: string;
  };

  try {
    if (body.action === "start" || !body.action) {
      const started = await startSoloMockRound({
        personId: person.id,
        caseId: body.caseId,
      });
      return NextResponse.json(started);
    }

    if (body.action === "commentary") {
      const out = await generateSoloMockCommentary({
        personId: person.id,
        teamId: person.team_id,
        caseTitle: body.caseTitle ?? "Case",
        caseNumber: body.caseNumber ?? null,
        caseId: body.caseId ?? null,
        presentationNotes: body.presentationNotes,
      });
      return NextResponse.json(out);
    }

    if (body.action === "judges") {
      const questions = await generateSoloMockJudges({
        personId: person.id,
        teamId: person.team_id,
        caseTitle: body.caseTitle ?? "Case",
        caseId: body.caseId ?? null,
      });
      return NextResponse.json({ questions });
    }

    if (body.action === "score") {
      if (!body.roundId) {
        return NextResponse.json({ error: "roundId required" }, { status: 400 });
      }
      const judged = await scoreSoloMockRound({
        roundId: body.roundId,
        personId: person.id,
        fallbackNotes: body.fallbackNotes,
      });
      return NextResponse.json({
        cards: judged.cards,
        scores: judged.scores,
        feedback: judged.feedback,
        report: judged.report,
        stub: judged.stub,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
