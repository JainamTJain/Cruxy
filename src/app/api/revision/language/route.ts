import { NextResponse } from "next/server";
import { requireSession } from "@/lib/revision/api-auth";
import {
  deletePhrasebookEntry,
  languageSuggestions,
  listPhrasebook,
  listTeamCaseClaims,
  savePhrase,
} from "@/lib/revision/repository";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");
  const caseId = url.searchParams.get("caseId");
  const entries = await listPhrasebook(auth.session.personId);
  const claims =
    teamId && caseId
      ? await listTeamCaseClaims(teamId, caseId)
      : [];
  return NextResponse.json({ entries, claims });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    teamId?: string;
    caseId?: string;
    claimId?: string;
    text?: string;
    kind?: "plain" | "analogy" | "vivid" | "custom";
    claimRef?: string | null;
    entryId?: string;
  };

  if (body.action === "suggest") {
    if (!body.teamId || !body.caseId) {
      return NextResponse.json({ error: "teamId and caseId required" }, { status: 400 });
    }
    const suggestions = await languageSuggestions({
      personId: auth.session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
      claimId: body.claimId,
    });
    return NextResponse.json({ suggestions });
  }

  if (body.action === "save") {
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const entry = await savePhrase({
      personId: auth.session.personId,
      caseId: body.caseId ?? null,
      claimRef: body.claimRef ?? body.claimId ?? null,
      text: body.text,
      kind: body.kind ?? "custom",
    });
    return NextResponse.json({ entry });
  }

  if (body.action === "delete") {
    if (!body.entryId) {
      return NextResponse.json({ error: "entryId required" }, { status: 400 });
    }
    await deletePhrasebookEntry(auth.session.personId, body.entryId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}