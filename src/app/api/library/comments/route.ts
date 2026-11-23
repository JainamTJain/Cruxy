import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createComment, getPassage } from "@/lib/db/library-repository";
import { logActivity } from "@/lib/db/repository";

// The note pass runs after the response.
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    passageId?: string;
    range?: string | null;
    body?: string;
    threadId?: string | null;
    caseId?: string | null;
  };

  if (!body.passageId || !body.body?.trim()) {
    return NextResponse.json(
      { error: "passageId and body required" },
      { status: 400 },
    );
  }

  const passage = await getPassage(body.passageId);
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  const comment = await createComment({
    passage_id: body.passageId,
    range: body.range ?? null,
    person_id: auth.session.personId,
    body: body.body.trim(),
    thread_id: body.threadId ?? null,
    created_by: auth.session.personId,
  });

  await logActivity({
    person_id: auth.session.personId,
    action: "comment_created",
    target: comment.id,
    meta: { passageId: body.passageId },
  });

  // A comment on the case text gets the same look as a reading room note:
  // if it carries ethical weight, Cruxy develops it into a suggestion.
  const teamId = auth.session.teamId;
  if (body.caseId && teamId && !body.threadId) {
    const caseId = body.caseId;
    const { after } = await import("next/server");
    after(async () => {
      const { listCases } = await import("@/lib/db/repository");
      const c = (await listCases()).find((x) => x.id === caseId);
      if (!c) return;
      const { considerNote } = await import("@/lib/reading/note-to-suggestion");
      await considerNote({
        sourceKind: "case_comment",
        sourceId: comment.id,
        teamId,
        caseId,
        personId: auth.session.personId,
        readingTitle: `Case ${c.number}: ${c.title}`,
        quote: body.range ?? null,
        note: body.body!.trim(),
        passage: (passage as { text?: string | null }).text ?? null,
      }).catch(() => undefined);
    });
  }
  return NextResponse.json({ comment });
}
