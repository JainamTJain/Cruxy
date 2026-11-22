import { NextResponse } from "next/server";
import { getPersonById } from "@/lib/db/repository";
import { canEditOnePager } from "@/lib/auth/capabilities";
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
  const teamId = url.searchParams.get("teamId");
  const caseId = url.searchParams.get("caseId");
  const id = url.searchParams.get("id");
  const versions = url.searchParams.get("versions");

  if (id) {
    const page = await getOnePagerById(id);
    const diff = await onePagerDiff(id);
    return NextResponse.json({ onePager: page, diff });
  }
  if (!teamId || !caseId) {
    const meta = await listCasesAndTeams();
    return NextResponse.json(meta);
  }

  if (versions === "1") {
    const list = await listOnePagerVersions(teamId, caseId);
    return NextResponse.json({ versions: list });
  }

  const page = await latestOnePager(teamId, caseId);
  const diff = page ? await onePagerDiff(page.id) : [];
  const person = await getPersonById(auth.session.personId);
  const canEdit = person
    ? canEditOnePager(person, auth.session, teamId)
    : false;
  return NextResponse.json({ onePager: page, diff, canEdit });
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
  };

  const person = await getPersonById(auth.session.personId);
  const editorName = person?.name?.split(" ")[0] ?? "someone";

  if (body.action === "draft") {
    if (!body.teamId || !body.caseId) {
      return NextResponse.json(
        { error: "teamId and caseId required" },
        { status: 400 },
      );
    }
    const denied = await assertCanEditOnePager(auth.session, body.teamId);
    if (denied) return denied;
    const page = await draftOnePager({
      teamId: body.teamId,
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
