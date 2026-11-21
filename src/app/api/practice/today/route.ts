import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listTodaySessionsForPerson } from "@/lib/practice/wave5";

/** F-189: today's sessions for Home Join. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessions = await listTodaySessionsForPerson({
    personId: session.personId,
    teamId: session.teamId,
  });
  return NextResponse.json({ sessions });
}
