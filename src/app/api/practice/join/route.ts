import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { joinWithSessionCode } from "@/lib/db/practice-repository";
import { hrefForPracticeScreen } from "@/lib/practice/join-routing";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      {
        error: "Sign in first, then join with the code.",
        whatToDo: "Open the sign-in page, pick your name, then try the code again.",
      },
      { status: 401 },
    );
  }
  const body = (await req.json()) as { code?: string };
  if (!body.code?.trim()) {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  const result = await joinWithSessionCode({
    code: body.code,
    personId: session.personId,
    ipKey: req.headers.get("x-forwarded-for") ?? "local",
    portal: "session_code",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        whatToDo:
          "Check the code with the person who started practice. Codes are short-lived when a session ends.",
      },
      { status: 400 },
    );
  }

  // Route hint by role in first round
  const round = result.rounds[0];
  let screen: "presenter" | "commenter" | "observer" | "moderator" | "judge" =
    "observer";
  if (session.teamId && round) {
    if (round.sides.presenting === session.teamId) screen = "presenter";
    else if (round.sides.commenting === session.teamId) screen = "commenter";
  }
  if (round?.moderator === session.personId) screen = "moderator";
  if (round?.judges.humans.includes(session.personId)) screen = "judge";

  const href = hrefForPracticeScreen(screen, {
    sessionId: result.session.id,
    roundId: round?.id ?? null,
  });

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
    roundId: round?.id ?? null,
    screen,
    href,
  });
}
