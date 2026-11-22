import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getLatestReflectionForCase } from "@/lib/learning/reflections";

export const runtime = "nodejs";

/** Prior reflection for this case, shown when starting the next round. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }
  const reflection = await getLatestReflectionForCase(
    session.personId,
    caseId,
  );
  return NextResponse.json({ reflection });
}
