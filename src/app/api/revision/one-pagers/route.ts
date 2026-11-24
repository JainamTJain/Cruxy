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
import { ensureLiveOnePager } from "@/lib/working-doc/ensure-one-pager";
import { writeOnePagerBodyToWorkingDoc } from "@/lib/working-doc/one-pager-writeback";

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

  const canEdit = canEditOnePager(person, auth.session, teamId);
  // Always derive a one pager from the working document (or truth source).
  // Never return an empty state to the client.
  const ensured = await ensureLiveOnePager({
    caseId,
    teamId,
    personId: auth.session.personId,
    canPersist: canEdit || canWriteTeamData(person, auth.session, teamId),
  });
  const page = ensured.onePager;
  const diff =
    page && !ensured.derived && !page.id.startsWith("derived:")
      ? await onePagerDiff(page.id)
      : [];
  const syncProposal = await getPendingOnePagerSync({ teamId, caseId });
  return NextResponse.json({
    onePager: page,
    diff,
    canEdit,
    flags: ensured.flags,
    sourceHash: ensured.sourceHash,
    derived: ensured.derived,
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
    fieldKey?: string;
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
    // Prefer working-document derivation over the old claim-map draft.
    const ensured = await ensureLiveOnePager({
      caseId: body.caseId,
      teamId,
      personId: auth.session.personId,
      canPersist: true,
    });
    // Force a fresh sync even if hand-edited, when the person asked to re-draft.
    const page = await draftOnePager({
      teamId,
      caseId: body.caseId,
      personId: auth.session.personId,
    });
    const saved = await saveOnePagerEdit({
      onePagerId: page.id,
      body: withEmptyRows(ensured.onePager.body),
      changeNote: "Cruxy re-draft from the working document",
      personId: auth.session.personId,
    });
    return NextResponse.json({ onePager: saved, flags: ensured.flags });
  }

  if (body.action === "save") {
    if (!body.body) {
      return NextResponse.json(
        { error: "body required" },
        { status: 400 },
      );
    }
    let teamId: string | null = null;
    let caseId: string | null = null;
    let onePagerId = body.onePagerId;

    if (onePagerId?.startsWith("derived:")) {
      const parts = onePagerId.split(":");
      teamId = parts[1] ?? body.teamId ?? null;
      caseId = parts[2] ?? body.caseId ?? null;
      onePagerId = undefined;
    }

    if (onePagerId) {
      const cur = await getOnePagerById(onePagerId);
      if (!cur) {
        return NextResponse.json({ error: "One pager not found" }, { status: 404 });
      }
      teamId = cur.team_id;
      caseId = cur.case_id;
    } else if (body.teamId && body.caseId) {
      teamId = body.teamId;
      caseId = body.caseId;
    }

    if (!teamId || !caseId) {
      return NextResponse.json(
        { error: "onePagerId or teamId and caseId required" },
        { status: 400 },
      );
    }

    const denied = await assertCanEditOnePager(auth.session, teamId);
    if (denied) return denied;

    // Materialise a derived page on first edit.
    let targetId = onePagerId;
    if (!targetId) {
      const existing = await latestOnePager(teamId, caseId);
      if (existing) {
        targetId = existing.id;
      } else {
        const drafted = await draftOnePager({
          teamId,
          caseId,
          personId: auth.session.personId,
        });
        targetId = drafted.id;
      }
    }

    const note = body.changeNote?.trim() || `Edited by ${editorName}`;
    const page = await saveOnePagerEdit({
      onePagerId: targetId,
      body: withEmptyRows(body.body),
      changeNote: note,
      personId: auth.session.personId,
    });

    // Write the edit back into the working document section it came from.
    await writeOnePagerBodyToWorkingDoc({
      caseId,
      teamId,
      personId: auth.session.personId,
      body: page.body,
      fieldKey: body.fieldKey,
    }).catch(() => undefined);

    const ensured = await ensureLiveOnePager({
      caseId,
      teamId,
      personId: auth.session.personId,
      canPersist: false,
    });

    return NextResponse.json({
      onePager: page,
      flags: ensured.flags,
    });
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
    await writeOnePagerBodyToWorkingDoc({
      caseId: source.case_id,
      teamId: source.team_id,
      personId: auth.session.personId,
      body: page.body,
      fieldKey: "restore",
    }).catch(() => undefined);
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
