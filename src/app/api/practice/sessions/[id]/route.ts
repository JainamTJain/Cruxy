import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getSessionById,
  listAttendance,
} from "@/lib/db/practice-repository";
import {
  listSessionRoster,
  revealSessionCode,
  setRoundJudgeMode,
} from "@/lib/db/supabase/practice-extra";

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
  const attendance = await listAttendance(id);
  const roster = await listSessionRoster(id);
  const creator = roster.people.find((p) => p.id === row.created_by);

  return NextResponse.json({
    session: {
      ...row,
      code_hash: admin ? row.code_hash : undefined,
    },
    attendance,
    admin,
    people: roster.people,
    joinedJudgeIds: roster.joinedJudgeIds,
    creatorName: creator?.name ?? "Coach",
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
