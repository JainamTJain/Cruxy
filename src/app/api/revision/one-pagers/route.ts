import { NextResponse } from "next/server";
import { getPersonById } from "@/lib/db/repository";
import { canEditOnePager } from "@/lib/auth/capabilities";
import {
  canSeeAllTeams,
  canWriteTeamData,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { requireSession } from "@/lib/revision/api-auth";
import { withEmptyRows } from "@/lib/revision/one-pager-edit";
import type { OnePagerBody } from "@/lib/revision/types";
import {
  draftOnePager,
  getOnePagerById,
  latestOnePager,
  listCasesAndTeams,
  listOnePagerVersions,
  onePagerDiff,
  saveOnePagerEdit,
  signOffOnePager,
  exportOnePagerStub,
} from "@/lib/revision/repository";
import { getPendingOnePagerSync } from "@/lib/db/supabase/one-pager-sync-extra";
import {
  acceptOnePagerSyncProposal,
  dismissOnePagerSyncProposal,
  proposeOnePagerFromWorkingDoc,
} from "@/lib/working-doc/one-pager-from-working";

async function assertCanEditOnePager(
  session: import("@/lib/types").SessionPayload,
  teamId: string,
) {
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!canEditOnePager(person, session, teamId)) {
    return NextResponse.json(
      { error: "Only this team's members, Dr. B or Jainam can edit" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("teamId");
  const caseId = url.searchParams.get("caseId");
  const id = url.searchParams.get("id");
  const versions = url.searchParams.get("versions");
  const person = await getPersonById(auth.session.personId);
  if (!person) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (id) {
    const page = await getOnePagerById(id);
    if (
      page &&
      !canSeeAllTeams(person, auth.session) &&
      page.team_id !== (person.team_id ?? auth.session.teamId)
    ) {
      return NextResponse.json(
        { error: "You can only open your own team's one pager." },
        { status: 403 },
      );
    }
    const diff = page ? await onePagerDiff(id) : [];
    return NextResponse.json({ onePager: page, diff });
  }
  if (!requestedTeamId || !caseId) {
    const meta = await listCasesAndTeams();
    if (!canSeeAllTeams(person, auth.session)) {
      const own = person.team_id ?? auth.session.teamId;
      return NextResponse.json({
        ...meta,
        teams: (meta.teams ?? []).filter(
          (t: { id: string }) => t.id === own,
        ),
      });
    }
    return NextResponse.json(meta);
  }

  const { teamId } = resolveVisibleTeamId({
    person,
    session: auth.session,
    requested: requestedTeamId,
  });
  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  if (versions === "1") {
    const list = await listOnePagerVersions(teamId, caseId);
    return NextResponse.json({ versions: list });
  }

  const page = await latestOnePager(teamId, caseId);
  const diff = page ? await onePagerDiff(page.id) : [];
  const canEdit = canEditOnePager(person, auth.session, teamId);
  const syncProposal = await getPendingOnePagerSync({ teamId, caseId });
  return NextResponse.json({
    onePager: page,
    diff,
    canEdit,
    syncProposal: syncProposal
      ? {
          id: syncProposal.id,
          changeSummary: syncProposal.change_summary,
          createdAt: syncProposal.created_at,
        }
      : null,
  });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    teamId?: string;
    caseId?: string;
    onePagerId?: string;
    body?: OnePagerBody;
    changeNote?: string;
    proposalId?: string;
  };

  const person = await getPersonById(auth.session.personId);
  const editorName = person?.name?.split(" ")[0] ?? "someone";

  if (body.action === "draft") {
    if (!body.teamId || !body.caseId || !person) {
      return NextResponse.json(
        { error: "teamId and caseId required" },
        { status: 400 },
      );
    }
    const { teamId } = resolveVisibleTeamId({
      person,
      session: auth.session,
      requested: body.teamId,
    });
    if (!teamId || !canWriteTeamData(person, auth.session, teamId)) {
      return NextResponse.json(
        { error: "You can only draft your own team's one pager." },
        { status: 403 },
      );
    }
    const denied = await assertCanEditOnePager(auth.session, teamId);
    if (denied) return denied;
    const page = await draftOnePager({
      teamId,
      caseId: body.caseId,
      personId: auth.session.personId,
    });
    return NextResponse.json({ onePager: page });
  }

  if (body.action === "save") {
    if (!body.onePagerId || !body.body) {
      return NextResponse.json(
        { error: "onePagerId and body required" },
        { status: 400 },
      );
    }
    const cur = await getOnePagerById(body.onePagerId);
    if (!cur) {
      return NextResponse.json({ error: "One pager not found" }, { status: 404 });
    }
    const denied = await assertCanEditOnePager(auth.session, cur.team_id);
    if (denied) return denied;
    const note =
      body.changeNote?.trim() || `Edited by ${editorName}`;
    const page = await saveOnePagerEdit({
      onePagerId: body.onePagerId,
      body: withEmptyRows(body.body),
      changeNote: note,
      personId: auth.session.personId,
    });
    return NextResponse.json({ onePager: page });
  }

  if (body.action === "restore") {
    if (!body.onePagerId) {
      return NextResponse.json({ error: "onePagerId required" }, { status: 400 });
    }
    const source = await getOnePagerById(body.onePagerId);
    if (!source) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const denied = await assertCanEditOnePager(auth.session, source.team_id);
    if (denied) return denied;
    const latest = await latestOnePager(source.team_id, source.case_id);
    if (!latest) {
      return NextResponse.json({ error: "No current version" }, { status: 404 });
    }
    const page = await saveOnePagerEdit({
      onePagerId: latest.id,
      body: withEmptyRows(source.body),
      changeNote: `Restored v${source.version} by ${editorName}`,
      personId: auth.session.personId,
    });
    return NextResponse.json({ onePager: page });
  }

  if (body.action === "signoff") {
    if (!body.onePagerId) {
      return NextResponse.json({ error: "onePagerId required" }, { status: 400 });
    }
    const cur = await getOnePagerById(body.onePagerId);
    if (!cur) {
      return NextResponse.json({ error: "One pager not found" }, { status: 404 });
    }
    const denied = await assertCanEditOnePager(auth.session, cur.team_id);
    if (denied) return denied;
    await signOffOnePager({
      onePagerId: body.onePagerId,
      personId: auth.session.personId,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "export") {
    if (!body.onePagerId) {
      return NextResponse.json({ error: "onePagerId required" }, { status: 400 });
    }
    const cur = await getOnePagerById(body.onePagerId);
    if (!cur) {
      return NextResponse.json({ error: "One pager not found" }, { status: 404 });
    }
    const denied = await assertCanEditOnePager(auth.session, cur.team_id);
    if (denied) return denied;
    const result = await exportOnePagerStub(
      body.onePagerId,
      auth.session.personId,
    );
    return NextResponse.json(result);
  }

  if (body.action === "propose_from_working") {
    if (!body.teamId || !body.caseId) {
      return NextResponse.json(
        { error: "teamId and caseId required" },
        { status: 400 },
      );
    }
    const denied = await assertCanEditOnePager(auth.session, body.teamId);
    if (denied) return denied;
    const result = await proposeOnePagerFromWorkingDoc({
      teamId: body.teamId,
      caseId: body.caseId,
      personId: auth.session.personId,
    });
    const syncProposal = await getPendingOnePagerSync({
      teamId: body.teamId,
      caseId: body.caseId,
    });
    return NextResponse.json({ ...result, syncProposal });
  }

  if (body.action === "accept_sync") {
    if (!body.teamId || !body.caseId || !body.proposalId) {
      return NextResponse.json(
        { error: "teamId, caseId and proposalId required" },
        { status: 400 },
      );
    }
    const denied = await assertCanEditOnePager(auth.session, body.teamId);
    if (denied) return denied;
    const page = await acceptOnePagerSyncProposal({
      proposalId: body.proposalId,
      personId: auth.session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
    });
    return NextResponse.json({ onePager: page });
  }

  if (body.action === "dismiss_sync") {
    if (!body.teamId || !body.caseId || !body.proposalId) {
      return NextResponse.json(
        { error: "teamId, caseId and proposalId required" },
        { status: 400 },
      );
    }
    const denied = await assertCanEditOnePager(auth.session, body.teamId);
    if (denied) return denied;
    await dismissOnePagerSyncProposal({
      proposalId: body.proposalId,
      personId: auth.session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
