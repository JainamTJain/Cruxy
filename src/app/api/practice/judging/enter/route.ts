import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createGuestJudgeAccess,
  getRoundById,
  joinWithSessionCode,
  upsertJudge,
} from "@/lib/db/practice-repository";
import { listTeams } from "@/lib/db/repository";
import { sessionHasTextOnlyMembers } from "@/lib/attendance";
import { assertSessionJoinable } from "@/lib/ops/consent-recording";

/**
 * Judging portal entry (F-392):
 * - Guests and known judges must enter a live session code.
 * - Guest tokens are bound to one round and die when the session ends.
 * - Client-supplied roundId alone is never enough (no open scoring of arbitrary rounds).
 */
export async function POST(req: Request) {
  const session = await getSession();
  let body: {
    code?: string;
    name?: string;
    background?: string;
    guest?: boolean;
    roundId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.code?.trim()) {
    return NextResponse.json(
      { error: "Session code required" },
      { status: 400 },
    );
  }

  const joined = await joinWithSessionCode({
    code: body.code,
    personId: session?.personId ?? null,
    ipKey: req.headers.get("x-forwarded-for") ?? "judge",
    portal: "judging",
  });
  if (!joined.ok) {
    return NextResponse.json({ error: joined.reason }, { status: 400 });
  }

  const joinable = await assertSessionJoinable(joined.session);
  if (!joinable.ok) {
    return NextResponse.json({ error: joinable.reason }, { status: 403 });
  }

  const sessionId = joined.session.id;
  const preferred = body.roundId?.trim() || null;
  const roundFromSession = preferred
    ? joined.rounds.find((r) => r.id === preferred) ?? null
    : null;
  const roundId = roundFromSession?.id ?? joined.rounds[0]?.id ?? null;

  if (!roundId) {
    return NextResponse.json({ error: "No round in session" }, { status: 400 });
  }

  const round = await getRoundById(roundId);
  if (!round || round.session_id !== sessionId) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const textOnlyBanner = await sessionHasTextOnlyMembers(sessionId);
  const allTeams = await listTeams();
  const teams = round.team_ids.map((id) => {
    const name = allTeams.find((t) => t.id === id)?.name ?? "Team";
    const role: "presenting" | "commenting" =
      round.sides.presenting === id
        ? "presenting"
        : round.sides.commenting === id
          ? "commenting"
          : round.sides.presenting
            ? "commenting"
            : "presenting";
    return { id, name, role };
  });

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
      teams,
      caseNumber: round.case_number,
      textOnlyBanner,
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
    sessionId,
    teamIds: round.team_ids,
    teams,
    caseNumber: round.case_number,
    textOnlyBanner,
  });
}
