import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import {
  ensureChangeTheFacts,
  ensureClaimMapShell,
  ensureOpposingPositions,
  getCaseBrain,
} from "@/lib/case-brain/service";
import { listTeams, getPersonById } from "@/lib/db/repository";
import { readStore } from "@/lib/db/sample-store";

type Params = { params: Promise<{ caseId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { caseId } = await params;
  const url = new URL(_req.url);
  const teamId = url.searchParams.get("teamId") ?? auth.teamId;

  await ensureClaimMapShell({
    teamId,
    caseId,
    personId: auth.session.personId,
  });
  await ensureOpposingPositions({
    caseId,
    personId: auth.session.personId,
  });

  const brain = await getCaseBrain(teamId, caseId);
  for (const node of brain.claims) {
    await ensureChangeTheFacts({
      teamId,
      caseId,
      claimId: node.claim.id,
      personId: auth.session.personId,
    });
  }
  const refreshed = await getCaseBrain(teamId, caseId);

  const [teams, store] = await Promise.all([listTeams(), readStore()]);
  const caseRow = store.cases.find((c) => c.id === caseId) ?? null;
  const people = store.people.map((p) => ({
    id: p.id,
    name: p.name,
    team_id: p.team_id,
  }));

  const canEdit = teamId === auth.teamId;
  const me = await getPersonById(auth.session.personId);

  return NextResponse.json({
    case: caseRow,
    teams,
    people,
    brain: refreshed,
    canEdit,
    viewer: {
      personId: auth.session.personId,
      teamId: auth.teamId,
      name: me?.name ?? auth.session.name,
    },
  });
}
