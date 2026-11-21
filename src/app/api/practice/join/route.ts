import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { joinWithSessionCode } from "@/lib/db/practice-repository";

export async function POST(req: Request) {
  const session = await getSession();
  const body = (await req.json()) as { code?: string };
  if (!body.code?.trim()) {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  const result = await joinWithSessionCode({
    code: body.code,
    personId: session?.personId ?? null,
    ipKey: req.headers.get("x-forwarded-for") ?? "local",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  // Route hint by role in first round
  const round = result.rounds[0];
  let screen: "presenter" | "commenter" | "observer" | "moderator" | "judge" =
    "observer";
  if (session?.teamId && round) {
    if (round.sides.presenting === session.teamId) screen = "presenter";
    else if (round.sides.commenting === session.teamId) screen = "commenter";
  }
  if (round?.moderator === session?.personId) screen = "moderator";

  return NextResponse.json({
    session: {
      id: result.session.id,
      title: result.session.title,
      kind: result.session.kind,
      status: result.session.status,
      date: result.session.date,
      online: result.session.online,
    },
    rounds: result.rounds,
    screen,
  });
}
