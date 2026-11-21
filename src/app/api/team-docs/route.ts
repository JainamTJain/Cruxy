import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listPeopleFull } from "@/lib/db/repository";
import {
  importTeamDoc,
  listImportsForTeam,
} from "@/lib/cruxy/team-doc-import";
import { DriveAccessError } from "@/lib/library/drive";

export const runtime = "nodejs";

/** List recent team doc imports for the caller's team (or ?teamId=). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.personId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") || session.teamId;
  const caseId = url.searchParams.get("caseId");
  if (!teamId) {
    return NextResponse.json({ error: "Pick a team first." }, { status: 400 });
  }

  const people = await listPeopleFull();
  const me = people.find((p) => p.id === session.personId);
  const isAdmin =
    me?.role === "tech_admin" || me?.role === "coach_admin";
  if (!isAdmin && me?.team_id && me.team_id !== teamId) {
    return NextResponse.json({ error: "Not your team." }, { status: 403 });
  }

  const imports = await listImportsForTeam({
    teamId,
    caseId: caseId || null,
  });
  return NextResponse.json({ ok: true, imports });
}

/** Import a Drive-linked or pasted team doc into that team's proposals queue. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.personId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await req.json()) as {
    teamId?: string;
    caseId?: string;
    driveUrl?: string | null;
    pastedText?: string | null;
    title?: string | null;
  };

  const teamId = body.teamId || session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "Pick a team first." }, { status: 400 });
  }
  if (!body.caseId) {
    return NextResponse.json({ error: "Pick a case." }, { status: 400 });
  }

  const people = await listPeopleFull();
  const me = people.find((p) => p.id === session.personId);
  const isAdmin =
    me?.role === "tech_admin" || me?.role === "coach_admin";
  if (!isAdmin && me?.team_id && me.team_id !== teamId) {
    return NextResponse.json(
      { error: "You can only import docs for your own team." },
      { status: 403 },
    );
  }

  try {
    const result = await importTeamDoc({
      teamId,
      caseId: body.caseId,
      personId: session.personId,
      driveUrl: body.driveUrl,
      pastedText: body.pastedText,
      title: body.title,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof DriveAccessError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
