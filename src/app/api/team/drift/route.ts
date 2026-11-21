import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { flagTranscriptDrift, listDriftFlags } from "@/lib/team/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teamId =
    new URL(req.url).searchParams.get("teamId") ?? session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const flags = await listDriftFlags(teamId);
  return NextResponse.json({ flags });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    teamId?: string;
    caseId?: string;
    personId?: string;
    versionId?: string;
    detail?: string;
    transcriptRef?: string;
  };
  if (
    !body.teamId ||
    !body.caseId ||
    !body.personId ||
    !body.versionId ||
    !body.detail ||
    !body.transcriptRef
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const flag = await flagTranscriptDrift({
    teamId: body.teamId,
    caseId: body.caseId,
    personId: body.personId,
    versionId: body.versionId,
    detail: body.detail,
    transcriptRef: body.transcriptRef,
  });
  return NextResponse.json({ flag });
}
