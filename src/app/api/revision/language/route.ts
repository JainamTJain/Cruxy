import { NextResponse } from "next/server";
import { requireSession } from "@/lib/revision/api-auth";
import {
  languageSuggestions,
  listPhrasebook,
  savePhrase,
} from "@/lib/revision/repository";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const entries = await listPhrasebook(auth.session.personId);
  return NextResponse.json({ entries });
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
      claimRef: body.claimRef ?? null,
      text: body.text,
      kind: body.kind ?? "custom",
    });
    return NextResponse.json({ entry });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
