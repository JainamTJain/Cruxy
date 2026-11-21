import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { buildReadAloudScript } from "@/lib/team/read-aloud";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") ?? session.teamId;
  const caseId = url.searchParams.get("caseId");
  if (!teamId || !caseId) {
    return NextResponse.json(
      { error: "teamId and caseId required" },
      { status: 400 },
    );
  }
  const script = await buildReadAloudScript({ teamId, caseId });
  return NextResponse.json(script);
}
