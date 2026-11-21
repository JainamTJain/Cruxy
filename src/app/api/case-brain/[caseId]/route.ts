import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { ensureDemoProposalQueue } from "@/lib/case-brain/ensure-demo-queue";
import { ensureClaimMapVersion } from "@/lib/case-brain/ensure-map-version";
import {
  diffClaimMapBodies,
  previousClaimMapVersion,
} from "@/lib/case-brain/map-diff";
import { publishClaimMapFromBrain } from "@/lib/case-brain/publish-from-brain";
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
import { listDeckOptInsForCase } from "@/lib/db/supabase/case-brain-extra";
import { listFlashcards, listQuestions } from "@/lib/revision/repository";
import {
  confirmClaimMapVersion,
  getCurrentClaimMap,
  listClaimMapVersions,
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
  // Sample-mode only; never invents live student-attributed proposals.
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

  const [teams, cases, peopleFull, flashcards, questions, mapVersion, versions, optIns] =
    await Promise.all([
      listTeams(),
      listCases(),
      listPeopleFull(),
      listFlashcards({ teamId, caseId }),
      listQuestions({ caseId }),
      getCurrentClaimMap(teamId, caseId),
      listClaimMapVersions(teamId, caseId),
      listDeckOptInsForCase(caseId),
    ]);
  const caseRow = cases.find((c) => c.id === caseId) ?? null;
  const people = peopleFull.map((p) => ({
    id: p.id,
    name: p.name,
    team_id: p.team_id,
  }));
  const confirmations = mapVersion
    ? await listConfirmations(mapVersion.id)
    : [];

  const canEdit = teamId === auth.teamId;
  const me = await getPersonById(auth.session.personId);
  const teamPeople = people.filter((p) => p.team_id === teamId);
  const confirmedIds = new Set(confirmations.map((c) => c.person_id));
  const unconfirmedNames = teamPeople
    .filter((p) => !confirmedIds.has(p.id))
    .map((p) => p.name);

  const prev = mapVersion
    ? previousClaimMapVersion(versions, mapVersion.id)
    : null;
  const diff_lines = mapVersion
    ? diffClaimMapBodies(prev?.body ?? null, mapVersion.body)
    : [];

  // Leads get the deck automatically. Anyone else on the case (or an
  // explicit unassigned opt-in) shows as "Also studying · (not assigned)".
  const leadIds = new Set(
    refreshed.case_roles
      .filter((r) => r.role === "lead_1" || r.role === "lead_2")
      .map((r) => r.person_id),
  );
  const alsoIds = new Set<string>();
  for (const o of optIns) {
    if (!o.assigned && !leadIds.has(o.person_id)) alsoIds.add(o.person_id);
  }
  for (const r of refreshed.case_roles) {
    if (!leadIds.has(r.person_id)) alsoIds.add(r.person_id);
  }
  const alsoStudying = [...alsoIds]
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  const truthAccepted = refreshed.truth_items.filter(
    (t) => t.status === "accepted",
  ).length;
  const truthRejected = refreshed.truth_items.filter(
    (t) => t.status === "rejected",
  ).length;
  const waitingProposals = refreshed.proposals.filter(
    (p) => p.status === "pending",
  ).length;

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
    meta: {
      truth_count: truthAccepted,
      truth_accepted: truthAccepted,
      truth_rejected: truthRejected,
      truth_waiting: waitingProposals,
      flashcard_count: flashcards.length,
      question_count: questions.filter((q) => q.status === "active").length,
      reading_count: 0,
      also_studying: alsoStudying,
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
            unconfirmed_names: unconfirmedNames,
            diff_lines,
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
    changeSummary?: string;
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

  if (body.action === "publish_version") {
    try {
      const version = await publishClaimMapFromBrain({
        teamId: auth.teamId,
        caseId,
        personId: auth.session.personId,
        changeSummary: body.changeSummary ?? "",
      });
      return NextResponse.json({ version });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Publish failed" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
