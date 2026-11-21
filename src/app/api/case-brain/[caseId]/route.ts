import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { ensureDemoProposalQueue } from "@/lib/case-brain/ensure-demo-queue";
import { ensureClaimMapVersion } from "@/lib/case-brain/ensure-map-version";
import {
  ensureChangeTheFacts,
  ensureClaimMapShell,
  ensureOpposingPositions,
  getCaseBrain,
} from "@/lib/case-brain/service";
import {
  getPersonById,
  listCases,
  listPeopleFull,
  listTeams,
} from "@/lib/db/repository";
import { listFlashcards, listQuestions } from "@/lib/revision/repository";
import {
  confirmClaimMapVersion,
  getCurrentClaimMap,
  listConfirmations,
} from "@/lib/team/repository";

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
  await ensureDemoProposalQueue({
    teamId,
    caseId,
    personId: auth.session.personId,
  });
  if (teamId === auth.teamId) {
    await ensureClaimMapVersion({
      teamId,
      caseId,
      personId: auth.session.personId,
    });
  }

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

  const [teams, cases, people, flashcards, questions, mapVersion] =
    await Promise.all([
      listTeams(),
      listCases(),
      listPeopleFull(),
      listFlashcards({ teamId, caseId }),
      listQuestions({ caseId }),
      getCurrentClaimMap(teamId, caseId),
    ]);
  const caseRow = cases.find((c) => c.id === caseId) ?? null;
  const confirmations = mapVersion
    ? await listConfirmations(mapVersion.id)
    : [];

  const canEdit = teamId === auth.teamId;
  const me = await getPersonById(auth.session.personId);
  const teamPeople = people.filter((p) => p.team_id === teamId);

  return NextResponse.json({
    case: caseRow,
    teams,
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      team_id: p.team_id,
    })),
    brain: refreshed,
    canEdit,
    viewer: {
      personId: auth.session.personId,
      teamId: auth.teamId,
      name: me?.name ?? auth.session.name,
    },
    meta: {
      truth_count: refreshed.truth_items.filter((t) => t.status === "accepted")
        .length,
      flashcard_count: flashcards.length,
      question_count: questions.filter((q) => q.status === "active").length,
      reading_count: 0,
      map_version: mapVersion
        ? {
            id: mapVersion.id,
            version: mapVersion.version,
            change_summary: mapVersion.change_summary,
            confirmed_by: confirmations.map((c) => c.person_id),
            confirmed_count: confirmations.length,
            team_size: Math.max(teamPeople.length, 1),
            viewer_confirmed: confirmations.some(
              (c) => c.person_id === auth.session.personId,
            ),
          }
        : null,
    },
  });
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { caseId } = await params;
  const body = (await req.json()) as {
    action?: string;
    versionId?: string;
  };

  if (body.action === "confirm_version" && body.versionId) {
    const confirmation = await confirmClaimMapVersion({
      versionId: body.versionId,
      personId: auth.session.personId,
    });
    return NextResponse.json({ confirmation });
  }

  if (body.action === "ensure_version") {
    await ensureClaimMapVersion({
      teamId: auth.teamId,
      caseId,
      personId: auth.session.personId,
    });
    const map = await getCurrentClaimMap(auth.teamId, caseId);
    return NextResponse.json({ version: map });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
