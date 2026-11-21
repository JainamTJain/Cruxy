import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { createComment, getPassage } from "@/lib/db/library-repository";
import { logActivity } from "@/lib/db/repository";

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    passageId?: string;
    range?: string | null;
    body?: string;
    threadId?: string | null;
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

  return NextResponse.json({ comment });
}
