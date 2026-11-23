import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import {
  addExtraReading,
  listExtraReading,
  optInExtraReading,
  setExtraReadingShared,
  type ExtraReadingKind,
} from "@/lib/case-home/extra-reading";

export async function GET(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  const teamId = url.searchParams.get("teamId") ?? auth.teamId;
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }
  if (teamId !== auth.teamId) {
    // Other teams' Extra reading is private; only own team (or later admin).
    return NextResponse.json(
      { error: "You can only open your team's Extra reading." },
      { status: 403 },
    );
  }
  const data = await listExtraReading({ caseId, teamId, viewerRole: auth.person.role });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    action: string;
    caseId?: string;
    teamId?: string;
    title?: string;
    body?: string;
    kind?: ExtraReadingKind;
    importId?: string;
    shared?: boolean;
  };
  const teamId = body.teamId ?? auth.teamId;
  if (teamId !== auth.teamId) {
    return NextResponse.json(
      { error: "You can only change your team's Extra reading." },
      { status: 403 },
    );
  }

  try {
    if (body.action === "add") {
      if (!body.caseId || !body.title?.trim()) {
        return NextResponse.json(
          { error: "caseId and title required" },
          { status: 400 },
        );
      }
      const item = await addExtraReading({
        caseId: body.caseId,
        teamId,
        personId: auth.session.personId,
        title: body.title,
        body: body.body ?? "",
        kind: body.kind,
      });
      const data = await listExtraReading({ caseId: body.caseId, teamId, viewerRole: auth.person.role });
      return NextResponse.json({ item, ...data });
    }
    if (body.action === "share") {
      if (!body.importId || typeof body.shared !== "boolean") {
        return NextResponse.json(
          { error: "importId and shared required" },
          { status: 400 },
        );
      }
      await setExtraReadingShared({
        importId: body.importId,
        teamId,
        personId: auth.session.personId,
        shared: body.shared,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "opt_in") {
      if (!body.importId || !body.caseId) {
        return NextResponse.json(
          { error: "importId and caseId required" },
          { status: 400 },
        );
      }
      await optInExtraReading({
        importId: body.importId,
        teamId,
        personId: auth.session.personId,
      });
      const data = await listExtraReading({
        caseId: body.caseId,
        teamId,
        viewerRole: auth.person.role,
      });
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save." },
      { status: 400 },
    );
  }
}
