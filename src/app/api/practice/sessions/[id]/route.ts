import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSessionById } from "@/lib/db/practice-repository";
import {
  listSessionRoster,
  revealSessionCode,
  setRoundJudgeMode,
} from "@/lib/db/supabase/practice-extra";
import {
  listAttendanceDetailed,
  sessionHasTextOnlyMembers,
} from "@/lib/attendance";
import { listTeams } from "@/lib/db/repository";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await getSessionById(id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const admin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");
  const [attendance, textOnlyBanner, teams] = await Promise.all([
    listAttendanceDetailed(id),
    sessionHasTextOnlyMembers(id),
    listTeams(),
  ]);
  const roster = await listSessionRoster(id);
  const creator = roster.people.find((p) => p.id === row.created_by);

  // Members who started the practice can invite; admins always can.
  const canInvite =
    admin || row.created_by === session.personId || row.kind === "member_practice";

  // Never return code_hash (or plaintext codes) here. Admins use reveal_code.
  const safeSession = { ...row, code_hash: undefined };
  return NextResponse.json({
    session: safeSession,
    attendance,
    textOnlyBanner,
    admin,
    canInvite,
    people: roster.people,
    joinedJudgeIds: roster.joinedJudgeIds,
    creatorName: creator?.name ?? "Coach",
    teams: teams.map((t) => ({ id: t.id, name: t.name, colour: t.colour })),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    action?: string;
    roundId?: string;
    mode?: "in_person" | "cruxy" | "both";
    humanIds?: string[];
  };

  if (body.action === "reveal_code" || body.action === "rotate_code") {
    const code = await revealSessionCode(id, session.personId);
    return NextResponse.json({ code });
  }

  if (body.action === "end_session") {
    const { endPracticeSession } = await import(
      "@/lib/db/practice-repository"
    );
    const ended = await endPracticeSession(id, session.personId);
    if (!ended) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ session: { ...ended, code_hash: undefined } });
  }

  if (body.action === "set_judges" && body.roundId && body.mode) {
    await setRoundJudgeMode({
      roundId: body.roundId,
      mode: body.mode,
      humanIds: body.humanIds,
      actorId: session.personId,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
