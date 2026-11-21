import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createGuestJudgeAccess,
  getRoundById,
  joinWithSessionCode,
  upsertJudge,
} from "@/lib/db/practice-repository";

/**
 * Judging portal entry:
 * - Known judge (signed-in member): enter session code → scoring card
 * - Guest: name + background + session code (or QR token path)
 */
export async function POST(req: Request) {
  const session = await getSession();
  const body = (await req.json()) as {
    code?: string;
    name?: string;
    background?: string;
    guest?: boolean;
    roundId?: string;
  };

  if (!body.code?.trim() && !body.roundId) {
    return NextResponse.json(
      { error: "Session code or roundId required" },
      { status: 400 },
    );
  }

  let roundId = body.roundId ?? null;
  let sessionId: string | null = null;

  if (body.code?.trim()) {
    const joined = await joinWithSessionCode({
      code: body.code,
      personId: session?.personId ?? null,
      ipKey: req.headers.get("x-forwarded-for") ?? "judge",
    });
    if (!joined.ok) {
      return NextResponse.json({ error: joined.reason }, { status: 400 });
    }
    sessionId = joined.session.id;
    roundId = joined.rounds[0]?.id ?? null;
  }

  if (!roundId) {
    return NextResponse.json({ error: "No round in session" }, { status: 400 });
  }

  const round = await getRoundById(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (body.guest || !session) {
    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Name required for guest judges" },
        { status: 400 },
      );
    }
    const { judge, token } = await createGuestJudgeAccess({
      name: body.name.trim(),
      background: body.background?.trim() ?? null,
      roundId,
    });
    return NextResponse.json({
      path: "guest",
      judge: { id: judge.id, name: judge.name, background: judge.background },
      roundId,
      sessionId,
      guestToken: token,
      teamIds: round.team_ids,
    });
  }

  const judge = await upsertJudge({
    name: session.name,
    background: body.background?.trim() ?? "USC Ethics Bowl member",
    personId: session.personId,
  });

  return NextResponse.json({
    path: "known",
    judge: { id: judge.id, name: judge.name, background: judge.background },
    roundId,
    sessionId: sessionId ?? round.session_id,
    teamIds: round.team_ids,
  });
}
