import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createProposal } from "@/lib/case-brain/service";
import {
  getPassage,
  getLibraryFile,
  saveFlashcard,
} from "@/lib/db/library-repository";
import { logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    passageId?: string;
    highlightText?: string;
    action?: "flashcard" | "proposal";
  };

  if (
    !body.passageId ||
    !body.action ||
    !["flashcard", "proposal"].includes(body.action)
  ) {
    return NextResponse.json(
      { error: "passageId and action (flashcard|proposal) required" },
      { status: 400 },
    );
  }

  const passage = await getPassage(body.passageId);
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }
  const file = await getLibraryFile(passage.file_id);
  const text = (body.highlightText ?? passage.text).slice(0, 500);
  const teamId = auth.session.teamId;
  const caseId = file?.case_ids[0] ?? null;

  if (body.action === "flashcard") {
    const card = {
      id: randomUUID(),
      team_id: teamId,
      case_id: caseId,
      deck: file ? `Reading · ${file.name}` : "Reading room",
      front: text.slice(0, 160),
      back: `From ${file?.name ?? "library"} · ${passage.anchor}`,
      citation_ids: [passage.id],
      truth_item_id: null,
      source_kind: "reading" as const,
      created_at: nowIso(),
      created_by: auth.session.personId,
      updated_at: nowIso(),
    };
    await saveFlashcard(card);
    await logActivity({
      person_id: auth.session.personId,
      action: "highlight_to_flashcard",
      target: card.id,
    });
    return NextResponse.json({ ok: true, flashcard: card });
  }

  if (!teamId) {
    return NextResponse.json(
      { error: "Team required for Truth Source proposal" },
      { status: 400 },
    );
  }
  if (!caseId) {
    return NextResponse.json(
      { error: "File must be tagged to a case before proposing" },
      { status: 400 },
    );
  }

  const proposal = await createProposal({
    teamId,
    caseId,
    personId: auth.session.personId,
    text,
    kind: "quote",
    origin: "reading",
    originRef: passage.id,
    citationIds: [passage.id],
  });
  await logActivity({
    person_id: auth.session.personId,
    action: "highlight_to_proposal",
    target: proposal.id,
  });
  return NextResponse.json({ ok: true, proposal });
}
