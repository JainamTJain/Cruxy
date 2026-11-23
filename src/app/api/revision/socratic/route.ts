import { NextResponse } from "next/server";
import {
  requirePerson,
  resolveTeamOrDeny,
  revisionError,
} from "@/lib/revision/api-auth";
import {
  continueSocratic,
  startSocraticDrill,
} from "@/lib/revision/repository";

export async function POST(req: Request) {
  const auth = await requirePerson();
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json()) as {
      action: string;
      teamId?: string;
      caseId?: string;
      sessionId?: string;
      answer?: string;
    };

    if (body.action === "start") {
      if (!body.caseId) {
        return NextResponse.json({ error: "caseId required" }, { status: 400 });
      }
      const team = resolveTeamOrDeny(
        auth.person,
        auth.session,
        body.teamId,
      );
      if ("error" in team) return team.error;
      const session = await startSocraticDrill({
        personId: auth.session.personId,
        teamId: team.teamId,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("not found") || msg.includes("belongs to someone else")) {
      return revisionError(err, msg || "Session not found.", 404);
    }
    return revisionError(err, "Cruxy could not continue the drill. Try again.");
  }
}
