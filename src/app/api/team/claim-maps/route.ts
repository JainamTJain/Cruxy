import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  acceptClaimChange,
  confirmClaimMapVersion,
  getCurrentClaimMap,
  listClaimMapVersions,
  listConfirmations,
  proposeClaimChange,
  publishClaimMapEdit,
} from "@/lib/team/repository";
import type { ClaimMapBody } from "@/lib/team/types";
import { readStore } from "@/lib/db/sample-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") ?? session.teamId;
  const caseId = url.searchParams.get("caseId");
  if (!teamId || !caseId) {
    return NextResponse.json({ error: "teamId and caseId required" }, { status: 400 });
  }
  const [current, versions] = await Promise.all([
    getCurrentClaimMap(teamId, caseId),
    listClaimMapVersions(teamId, caseId),
  ]);
  const confirmations = current
    ? await listConfirmations(current.id)
    : [];
  const store = await readStore();
  const proposals = store.claim_change_proposals.filter(
    (p) =>
      p.team_id === teamId &&
      p.case_id === caseId &&
      p.status === "pending",
  );
  return NextResponse.json({ current, versions, confirmations, proposals });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?:
      | "edit"
      | "propose_claim"
      | "accept_claim"
      | "confirm";
    teamId?: string;
    caseId?: string;
    mapBody?: ClaimMapBody;
    changeSummary?: string;
    claimKey?: string;
    newText?: string;
    reason?: string;
    proposalId?: string;
    versionId?: string;
  };

  try {
    if (body.action === "confirm" && body.versionId) {
      const confirmation = await confirmClaimMapVersion({
        versionId: body.versionId,
        personId: session.personId,
      });
      return NextResponse.json({ confirmation });
    }

    if (body.action === "propose_claim") {
      if (!body.teamId || !body.caseId || !body.claimKey || !body.newText || !body.reason) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const proposal = await proposeClaimChange({
        teamId: body.teamId,
        caseId: body.caseId,
        claimKey: body.claimKey,
        newText: body.newText,
        reason: body.reason,
        actorId: session.personId,
      });
      return NextResponse.json({ proposal });
    }

    if (body.action === "accept_claim" && body.proposalId) {
      const result = await acceptClaimChange({
        proposalId: body.proposalId,
        accepterId: session.personId,
      });
      return NextResponse.json(result);
    }

    if (body.action === "edit") {
      if (!body.teamId || !body.caseId || !body.mapBody || !body.changeSummary) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const version = await publishClaimMapEdit({
        teamId: body.teamId,
        caseId: body.caseId,
        body: body.mapBody,
        changeSummary: body.changeSummary,
        actorId: session.personId,
      });
      return NextResponse.json({ version });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
