import { NextResponse } from "next/server";
import { requireSession } from "@/lib/revision/api-auth";
import {
  continueSocratic,
  startSocraticDrill,
} from "@/lib/revision/repository";

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    teamId?: string;
    caseId?: string;
    sessionId?: string;
    answer?: string;
  };

  if (body.action === "start") {
    if (!body.teamId || !body.caseId) {
      return NextResponse.json({ error: "teamId and caseId required" }, { status: 400 });
    }
    const session = await startSocraticDrill({
      personId: auth.session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
    });
    return NextResponse.json({ session });
  }

  if (body.action === "answer") {
    if (!body.sessionId || !body.answer?.trim()) {
      return NextResponse.json(
        { error: "sessionId and answer required" },
        { status: 400 },
      );
    }
    const session = await continueSocratic({
      sessionId: body.sessionId,
      personId: auth.session.personId,
      answer: body.answer,
    });
    return NextResponse.json({ session });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
