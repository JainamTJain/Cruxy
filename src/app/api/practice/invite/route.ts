import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  acceptSessionInvite,
  inviteTeamToSession,
} from "@/lib/practice/wave5";

/** F-200: invite another team, or accept an invite. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: "invite" | "accept";
    sessionId?: string;
    teamId?: string;
  };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  if (body.action === "accept") {
    const result = await acceptSessionInvite({
      sessionId: body.sessionId,
      personId: session.personId,
      teamId: session.teamId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (!body.teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }
  const result = await inviteTeamToSession({
    sessionId: body.sessionId,
    teamId: body.teamId,
    invitedBy: session.personId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json(result);
}
