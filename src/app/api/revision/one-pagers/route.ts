import { NextResponse } from "next/server";
import { requireSession } from "@/lib/revision/api-auth";
import {
  draftOnePager,
  latestOnePager,
  listCasesAndTeams,
  onePagerDiff,
  saveOnePagerEdit,
  signOffOnePager,
  exportOnePagerStub,
} from "@/lib/revision/repository";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");
  const caseId = url.searchParams.get("caseId");
  const id = url.searchParams.get("id");
  if (id) {
    const diff = await onePagerDiff(id);
    return NextResponse.json({ diff });
  }
  if (!teamId || !caseId) {
    const meta = await listCasesAndTeams();
    return NextResponse.json(meta);
  }
  const page = await latestOnePager(teamId, caseId);
  const diff = page ? await onePagerDiff(page.id) : [];
  return NextResponse.json({ onePager: page, diff });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    teamId?: string;
    caseId?: string;
    onePagerId?: string;
    body?: unknown;
    changeNote?: string;
  };

  if (body.action === "draft") {
    if (!body.teamId || !body.caseId) {
      return NextResponse.json({ error: "teamId and caseId required" }, { status: 400 });
    }
    const page = await draftOnePager({
      teamId: body.teamId,
      caseId: body.caseId,
      personId: auth.session.personId,
    });
    return NextResponse.json({ onePager: page });
  }

  if (body.action === "save") {
    if (!body.onePagerId || !body.body || !body.changeNote?.trim()) {
      return NextResponse.json(
        { error: "onePagerId, body, and changeNote required" },
        { status: 400 },
      );
    }
    const page = await saveOnePagerEdit({
      onePagerId: body.onePagerId,
      body: body.body as never,
      changeNote: body.changeNote,
      personId: auth.session.personId,
    });
    return NextResponse.json({ onePager: page });
  }

  if (body.action === "signoff") {
    if (!body.onePagerId) {
      return NextResponse.json({ error: "onePagerId required" }, { status: 400 });
    }
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
    const result = await exportOnePagerStub(
      body.onePagerId,
      auth.session.personId,
    );
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
