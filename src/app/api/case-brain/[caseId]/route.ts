import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { loadCaseBrainPage } from "@/lib/case-brain/load-page";
import { ensureClaimMapVersion } from "@/lib/case-brain/ensure-map-version";
import { publishClaimMapFromBrain } from "@/lib/case-brain/publish-from-brain";
import {
  confirmClaimMapVersion,
  getCurrentClaimMap,
} from "@/lib/team/repository";

type Params = { params: Promise<{ caseId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { caseId } = await params;
  const url = new URL(_req.url);
  const result = await loadCaseBrainPage({
    caseId,
    requestedTeamId: url.searchParams.get("teamId") ?? auth.teamId,
    lite: url.searchParams.get("lite") === "1",
    auth,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.data);
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
