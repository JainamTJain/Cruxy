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

  if (body.action === "next_round") {
    const { advanceRoundPhase } = await import(
      "@/lib/db/practice-repository"
    );
    const row = await getSessionById(id);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const rounds = [...row.rounds].sort((a, b) => a.order - b.order);
    const current =
      rounds.find(
        (r) =>
          r.phase !== "setup" && r.phase !== "done" && r.phase !== "scoring",
      ) ??
      rounds.find((r) => r.phase === "scoring") ??
      rounds.find((r) => r.phase !== "done");
    if (!current) {
      return NextResponse.json(
        { error: "No open round left", whatToDo: "All rounds are done." },
        { status: 400 },
      );
    }
    if (current.phase !== "done") {
      await advanceRoundPhase(current.id, "done");
    }
    const next = rounds.find(
      (r) => r.order > current.order && r.phase !== "done",
    );
    if (!next) {
      return NextResponse.json({
        ok: true,
        done: true,
        nextRoundId: null,
        href: `/practice/sessions/${id}`,
      });
    }
    return NextResponse.json({
      ok: true,
      done: false,
      nextRoundId: next.id,
      href: `/practice/rounds/${next.id}`,
    });
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
