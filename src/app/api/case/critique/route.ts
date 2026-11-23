import { NextResponse } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  runCritiqueForTeamCase,
  scheduleCritiqueOnChange,
} from "@/lib/critique/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Trigger a critique of the working document for this team/case.
 * ?debounce=1 schedules an 8s coalesced run (on-change).
 * Default runs immediately (manual).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    caseId?: string;
    teamId?: string | null;
    debounce?: boolean;
  };
  const caseId = body.caseId?.trim();
  const teamId = body.teamId?.trim() || person.team_id || session.teamId;
  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }
  if (
    person.role === "member" &&
    person.team_id &&
    person.team_id !== teamId
  ) {
    return NextResponse.json(
      { error: "You can only critique your own team's document." },
      { status: 403 },
    );
  }

  if (body.debounce) {
    after(() =>
      scheduleCritiqueOnChange({
        caseId,
        teamId,
        personId: session.personId,
      }),
    );
    return NextResponse.json({
      ok: true,
      scheduled: true,
      message: "Critique scheduled. Suggestions will appear shortly.",
    });
  }

  const result = await runCritiqueForTeamCase({
    caseId,
    teamId,
    personId: session.personId,
    trigger: "manual",
  });
  return NextResponse.json({
    ok: true,
    posted: result.posted,
    skippedCap: result.skippedCap,
    kinds: result.findings.map((f) => f.kind),
  });
}
