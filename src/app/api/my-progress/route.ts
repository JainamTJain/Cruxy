import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { getMyProgressView } from "@/lib/learning/progress";
import { isAdminViewer } from "@/lib/ops/privacy-scope";

export const runtime = "nodejs";

/** Personal progress. Self or admin viewer only. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("personId") ?? session.personId;
  const me = await getPersonById(session.personId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (subjectId !== session.personId && !isAdminViewer(me, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const view = await getMyProgressView(subjectId);
  return NextResponse.json(view);
}
