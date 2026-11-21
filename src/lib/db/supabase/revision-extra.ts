import "server-only";
import { randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { iso, isoOrNull, type Row } from "@/lib/db/supabase/util";
import type { CardFsrsState, Flashcard } from "@/lib/revision/types";

function must<T>(
  res: { data: T; error: { message: string } | null },
  ctx: string,
): T {
  assertOk(res.error, ctx);
  return res.data;
}

function mapFsrs(r: Row): CardFsrsState {
  return {
    id: r.id,
    person_id: r.person_id,
    card_id: r.card_id,
    due: iso(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: isoOrNull(r.last_review),
    correct_streak: r.correct_streak ?? 0,
    pinned: Boolean(r.pinned),
    created_at: iso(r.created_at),
  };
}

export type DueDeckResult = {
  cards: {
    card: Flashcard;
    state: CardFsrsState | null;
    underAttack?: boolean;
    mastery?: number | null;
  }[];
  dailyTarget: number;
  cramMode: boolean;
  daysToCompetition: number | null;
  leadCaseCount: number;
  totalInRotation: number;
  openAttackCount?: number;
};

/** Pin (or unpin) a card in this person's deck. Keeps it in rotation when pinned. */
export async function setFlashcardPinned(args: {
  personId: string;
  cardId: string;
  pinned: boolean;
}): Promise<CardFsrsState> {
  const sb = getServiceSupabase();
  const existing = must(
    await sb
      .from("card_fsrs_states")
      .select("*")
      .eq("person_id", args.personId)
      .eq("card_id", args.cardId)
      .maybeSingle(),
    "setFlashcardPinned.find",
  );

  if (existing) {
    assertOk(
      (
        await sb
          .from("card_fsrs_states")
          .update({ pinned: args.pinned })
          .eq("id", existing.id)
      ).error,
      "setFlashcardPinned.update",
    );
    return mapFsrs({ ...existing, pinned: args.pinned });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  assertOk(
    (
      await sb.from("card_fsrs_states").insert({
        id,
        person_id: args.personId,
        card_id: args.cardId,
        due: now,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        last_review: null,
        correct_streak: 0,
        pinned: args.pinned,
        created_at: now,
      })
    ).error,
    "setFlashcardPinned.insert",
  );
  const row = must(
    await sb.from("card_fsrs_states").select("*").eq("id", id).single(),
    "setFlashcardPinned.reload",
  );
  return mapFsrs(row);
}

/**
 * Due deck ordered with graph-aware priority (claim mastery + open attacks).
 * Caps the session list to the rising daily target; pin and cram still apply.
 */
export async function dueDeckForPerson(
  personId: string,
): Promise<DueDeckResult> {
  const { dueGraphDeckForPerson } = await import(
    "@/lib/db/supabase/graph-flashcards"
  );
  const deck = await dueGraphDeckForPerson(personId);
  return {
    cards: deck.cards,
    dailyTarget: deck.dailyTarget,
    cramMode: deck.cramMode,
    daysToCompetition: deck.daysToCompetition,
    leadCaseCount: deck.leadCaseCount,
    totalInRotation: deck.totalInRotation,
    openAttackCount: deck.openAttackCount,
  };
}
