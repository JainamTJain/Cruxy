import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { reviewFlashcard } from "@/lib/revision/repository";
import type { FsrsRating } from "@/lib/revision/fsrs";
import {
  dueCardsForStudyDeck,
  listStudyDecksForPerson,
  syncPracticeStudyCards,
} from "@/lib/db/supabase/practice-study-extra";
import type { StudyDeckKind } from "@/lib/practice/study-decks";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const url = new URL(req.url);
  const deck = url.searchParams.get("deck") as StudyDeckKind | null;
  const caseId = url.searchParams.get("caseId");

  if (deck) {
    const cards = await dueCardsForStudyDeck({
      personId: session.personId,
      deck,
      caseId,
    });
    return NextResponse.json({ cards, deck });
  }

  const decks = await listStudyDecksForPerson(session.personId);
  return NextResponse.json({ decks });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: string;
    cardId?: string;
    grade?: number;
    mode?: "typed" | "spoken";
  };

  if (body.action === "sync") {
    const result = await syncPracticeStudyCards(session.personId);
    const decks = await listStudyDecksForPerson(session.personId);
    return NextResponse.json({ ...result, decks });
  }

  if (body.action === "review") {
    if (!body.cardId || !body.grade) {
      return NextResponse.json(
        { error: "cardId and grade required" },
        { status: 400 },
      );
    }
    const grade = body.grade as FsrsRating;
    if (![1, 2, 3, 4].includes(grade)) {
      return NextResponse.json({ error: "grade must be 1 to 4" }, { status: 400 });
    }
    const result = await reviewFlashcard({
      personId: session.personId,
      cardId: body.cardId,
      grade,
      mode: body.mode,
    });
    return NextResponse.json(
      result && typeof result === "object" && "state" in result
        ? result
        : { state: result },
    );
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
