import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listTeams } from "@/lib/db/repository";
import {
  canWriteDiscussion,
  isDiscussionAdmin,
  resolveDiscussionTeamId,
} from "@/lib/discussion/access";
import {
  ensureThread,
  isDiscussionKind,
  listThreadsForCase,
} from "@/lib/discussion/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  const requested = url.searchParams.get("teamId");
  const teamId = resolveDiscussionTeamId(person, session, requested);

  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }

  // Own team only (admins may switch).
  if (
    !isDiscussionAdmin(person, session) &&
    teamId !== (person.team_id ?? session.teamId)
  ) {
    return NextResponse.json(
      { error: "You can only see your own team's discussion." },
      { status: 403 },
    );
  }

  const threads = await listThreadsForCase({ teamId, caseId });
  const teams = isDiscussionAdmin(person, session) ? await listTeams() : [];

  return NextResponse.json({
    threads,
    teamId,
    caseId,
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    canSwitchTeam: isDiscussionAdmin(person, session),
    canWrite: canWriteDiscussion(person, session, teamId),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const body = (await req.json()) as {
    caseId?: string;
    teamId?: string;
    kind?: string;
    targetId?: string;
    title?: string;
  };

  const teamId = resolveDiscussionTeamId(
    person,
    session,
    body.teamId ?? null,
  );
  if (!body.caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }
  if (!canWriteDiscussion(person, session, teamId)) {
    return NextResponse.json(
      { error: "You can only discuss on your own team." },
      { status: 403 },
    );
  }
  if (!isDiscussionKind(body.kind) || !body.targetId?.trim()) {
    return NextResponse.json(
      { error: "kind and targetId are required." },
      { status: 400 },
    );
  }

  const thread = await ensureThread({
    teamId,
    caseId: body.caseId,
    kind: body.kind,
    targetId: body.targetId.trim(),
    title: body.title?.trim() || "",
    personId: person.id,
  });

  return NextResponse.json({ thread });
}
