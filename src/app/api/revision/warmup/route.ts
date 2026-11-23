import { NextResponse } from "next/server";
import {
  requirePerson,
  revisionError,
} from "@/lib/revision/api-auth";
import {
  answerQuestion,
  buildWarmUp,
  reviewFlashcard,
} from "@/lib/revision/repository";
import { logActivity } from "@/lib/db/repository";
import type { FsrsRating } from "@/lib/revision/fsrs";

export async function GET(req: Request) {
  const auth = await requirePerson();
  if ("error" in auth) return auth.error;
  try {
    const url = new URL(req.url);
    const caseId = url.searchParams.get("caseId") ?? undefined;
    const warm = await buildWarmUp(auth.session.personId, { caseId });
    await logActivity({
      person_id: auth.session.personId,
      action: "warmup_built",
      target: caseId ?? null,
      meta: {
        flashcards: warm.flashcards.length,
        questions: warm.moderator_questions.length,
      },
    });
    return NextResponse.json(warm);
  } catch (err) {
    return revisionError(err, "Could not build your warm-up. Try again.");
  }
}

export async function POST(req: Request) {
  const auth = await requirePerson();
  if ("error" in auth) return auth.error;
  try {
    const body = (await req.json()) as {
      action: string;
      cardId?: string;
      questionId?: string;
      text?: string;
      caseId?: string | null;
    };

    if (body.action === "review_card") {
      if (!body.cardId) {
        return NextResponse.json({ error: "cardId required" }, { status: 400 });
      }
      const result = await reviewFlashcard({
        personId: auth.session.personId,
        cardId: body.cardId,
        grade: 3 as FsrsRating,
        mode: "spoken",
      });
      return NextResponse.json({ ok: true, state: result.state });
    }

    if (body.action === "answer_question") {
      if (!body.questionId) {
        return NextResponse.json(
          { error: "questionId required" },
          { status: 400 },
        );
      }
      const answer = await answerQuestion({
        questionId: body.questionId,
        personId: auth.session.personId,
        text: body.text?.trim() || "Answered out loud in warm-up.",
        mode: "spoken",
      });
      return NextResponse.json({ ok: true, answer });
    }

    if (body.action === "complete") {
      await logActivity({
        person_id: auth.session.personId,
        action: "warmup_done",
        target: body.caseId ?? null,
        meta: {},
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return revisionError(err, "Could not save warm-up progress. Try again.");
  }
}
