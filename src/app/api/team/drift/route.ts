import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  filterDriftFlagsForViewer,
  isAdminViewer,
  isCaseLead,
} from "@/lib/ops/privacy-scope";
import { flagTranscriptDrift, listDriftFlags } from "@/lib/team/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requested =
    new URL(req.url).searchParams.get("teamId") ?? session.teamId;
  if (!requested) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const admin = isAdminViewer(person, session);
  const ownTeam = person.team_id ?? session.teamId;
  if (!admin && ownTeam && requested !== ownTeam) {
    return NextResponse.json(
      { error: "You can only view drift flags for your own team." },
      { status: 403 },
    );
  }
  const flags = await listDriftFlags(requested);

  // private_to_leads: case lead for that flag's case, or admin. Else own only.
  const visible: typeof flags = [];
  for (const f of flags) {
    if (!f.private_to_leads) {
      visible.push(f);
      continue;
    }
    const lead = f.case_id
      ? await isCaseLead({
          personId: person.id,
          teamId: requested,
          caseId: f.case_id,
        })
      : false;
    const kept = filterDriftFlagsForViewer([f], {
      viewerPersonId: person.id,
      adminViewer: admin,
      isLead: lead,
    });
    visible.push(...kept);
  }
  return NextResponse.json({ flags: visible });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
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
  const admin = isAdminViewer(person, session);
  const ownTeam = person.team_id ?? session.teamId;
  if (!admin && ownTeam && body.teamId !== ownTeam) {
    return NextResponse.json(
      { error: "You can only flag drift on your own team." },
      { status: 403 },
    );
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
