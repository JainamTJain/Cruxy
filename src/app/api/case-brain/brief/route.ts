import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canWriteTeamData,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { getPersonById, listPeopleFull } from "@/lib/db/repository";
import {
  acceptBriefSuggestion,
  confirmStance,
  decideFactCandidate,
  flagStanceDrift,
  getTeamBriefView,
  linkBriefDriveDoc,
  markChecklistItem,
  setBriefMode,
  setStance,
} from "@/lib/case-brain/team-brief";
import type { BriefMode } from "@/lib/db/supabase/team-brief-extra";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  const { teamId } = resolveVisibleTeamId({
    person,
    session,
    requested: url.searchParams.get("teamId"),
  });
  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }
  const people = await listPeopleFull();
  const view = await getTeamBriefView({
    teamId,
    caseId,
    personId: session.personId,
    people: people.map((p: { id: string; name: string }) => ({
      id: p.id,
      name: p.name,
    })),
  });
  return NextResponse.json(view);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action?: string;
    caseId?: string;
    teamId?: string;
    mode?: BriefMode;
    driveUrl?: string;
    thesis?: string;
    proposalId?: string;
    reason?: string;
    text?: string;
    editedText?: string | null;
    kind?: "suggestion" | "evidence" | "question" | "counter" | "inspired";
    checklistId?: string;
    done?: boolean;
    candidateId?: string;
    accept?: boolean;
    driftDetail?: string;
  };

  const caseId = body.caseId;
  const { teamId } = resolveVisibleTeamId({
    person,
    session,
    requested: body.teamId ?? null,
  });
  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId are required." },
      { status: 400 },
    );
  }
  if (!canWriteTeamData(person, session, teamId)) {
    return NextResponse.json(
      { error: "You can only edit your own team's brief." },
      { status: 403 },
    );
  }

  try {
    switch (body.action) {
      case "set_mode": {
        if (body.mode !== "own_doc" && body.mode !== "build_in_crux") {
          return NextResponse.json({ error: "Pick a Brief mode." }, { status: 400 });
        }
        const brief = await setBriefMode({
          teamId,
          caseId,
          mode: body.mode,
          personId: session.personId,
        });
        return NextResponse.json({ brief });
      }
      case "link_doc": {
        if (!body.driveUrl?.trim()) {
          return NextResponse.json(
            { error: "Paste a Google Doc link from the Ethics Bowl Drive folder." },
            { status: 400 },
          );
        }
        const result = await linkBriefDriveDoc({
          teamId,
          caseId,
          personId: session.personId,
          driveUrl: body.driveUrl,
        });
        return NextResponse.json(result);
      }
      case "set_stance": {
        const brief = await setStance({
          teamId,
          caseId,
          personId: session.personId,
          thesis: body.thesis ?? "",
        });
        return NextResponse.json({ brief });
      }
      case "confirm_stance": {
        const brief = await confirmStance({
          teamId,
          caseId,
          personId: session.personId,
        });
        return NextResponse.json({ brief });
      }
      case "flag_drift": {
        const brief = await flagStanceDrift({
          teamId,
          caseId,
          detail: body.driftDetail ?? "Notes or answers conflict with the agreed stance.",
          personId: session.personId,
        });
        return NextResponse.json({ brief });
      }
      case "accept_suggestion": {
        if (!body.proposalId || !body.text) {
          return NextResponse.json(
            { error: "Missing suggestion." },
            { status: 400 },
          );
        }
        const result = await acceptBriefSuggestion({
          teamId,
          caseId,
          personId: session.personId,
          proposalId: body.proposalId,
          reason: body.reason ?? "",
          text: body.text,
          editedText: body.editedText,
          kind: body.kind,
        });
        return NextResponse.json(result);
      }
      case "checklist_done": {
        if (!body.checklistId) {
          return NextResponse.json({ error: "Missing checklist item." }, { status: 400 });
        }
        const item = await markChecklistItem({
          id: body.checklistId,
          done: Boolean(body.done),
          personId: session.personId,
        });
        return NextResponse.json({ item });
      }
      case "decide_candidate": {
        if (!body.candidateId) {
          return NextResponse.json({ error: "Missing candidate." }, { status: 400 });
        }
        const candidate = await decideFactCandidate({
          id: body.candidateId,
          accept: Boolean(body.accept),
          personId: session.personId,
          teamId,
        });
        return NextResponse.json({ candidate });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the Brief." },
      { status: 400 },
    );
  }
}
