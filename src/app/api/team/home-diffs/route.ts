import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { homeDiffsForPerson } from "@/lib/team/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const diffs = await homeDiffsForPerson(session.personId);
  return NextResponse.json({ diffs });
}
