import "server-only";
import { randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { iso, isoOrNull, type Row } from "@/lib/db/supabase/util";
import {
  applyDailyCap,
  dailyFlashcardTarget,
  daysUntil,
  isCramMode,
  orderDeckForPerson,
} from "@/lib/revision/deck";
import type { CardFsrsState, Flashcard } from "@/lib/revision/types";
import { listCompetitions } from "@/lib/db/repository";

function must<T>(
  res: { data: T; error: { message: string } | null },
  ctx: string,
): T {
  assertOk(res.error, ctx);
  return res.data;
}

function mapFlashcard(r: Row): Flashcard {
  return {
    id: r.id,
    team_id: r.team_id ?? null,
    case_id: r.case_id ?? null,
    deck: r.deck ?? "",
    front: r.front,
    back: r.back,
    citation_ids: r.citation_ids ?? [],
    truth_item_id: r.truth_item_id ?? null,
    source_kind: r.source_kind ?? "manual",
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: iso(r.updated_at ?? r.created_at),
  };
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
  cards: { card: Flashcard; state: CardFsrsState | null }[];
  dailyTarget: number;
  cramMode: boolean;
  daysToCompetition: number | null;
  leadCaseCount: number;
  totalInRotation: number;
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
 * Due deck ordered by this person's FSRS state, with pins and cram mode.
 * Caps the session list to the rising daily target.
 */
export async function dueDeckForPerson(
  personId: string,
): Promise<DueDeckResult> {
  const sb = getServiceSupabase();
  const [optIns, roles, competitions] = await Promise.all([
    sb.from("deck_opt_ins").select("case_id").eq("person_id", personId),
    sb
      .from("case_roles")
      .select("case_id")
      .eq("person_id", personId)
      .in("role", ["lead_1", "lead_2"]),
    listCompetitions(),
  ]);

  const caseIds = new Set<string>();
  const leadCaseIds = new Set<string>();
  for (const r of must(optIns, "dueDeck.optIns") ?? []) caseIds.add(r.case_id);
  for (const r of must(roles, "dueDeck.roles") ?? []) {
    caseIds.add(r.case_id);
    leadCaseIds.add(r.case_id);
  }

  const nextCompetition = competitions[0] ?? null;
  const daysToCompetition = daysUntil(nextCompetition?.date);
  const cramMode = isCramMode(daysToCompetition);
  const dailyTarget = dailyFlashcardTarget({
    daysToCompetition,
    leadCaseCount: leadCaseIds.size,
    cramMode,
  });

  if (caseIds.size === 0) {
    return {
      cards: [],
      dailyTarget,
      cramMode,
      daysToCompetition,
      leadCaseCount: leadCaseIds.size,
      totalInRotation: 0,
    };
  }

  const cardRows =
    must(
      await sb
        .from("flashcards")
        .select("*")
        .in("case_id", [...caseIds])
        .order("created_at", { ascending: true }),
      "dueDeck.cards",
    ) ?? [];
  const cards = cardRows.map(mapFlashcard);
  if (cards.length === 0) {
    return {
      cards: [],
      dailyTarget,
      cramMode,
      daysToCompetition,
      leadCaseCount: leadCaseIds.size,
      totalInRotation: 0,
    };
  }

  const stateRows =
    must(
      await sb
        .from("card_fsrs_states")
        .select("*")
        .eq("person_id", personId)
        .in(
          "card_id",
          cards.map((c) => c.id),
        ),
      "dueDeck.states",
    ) ?? [];
  const statesByCardId = new Map<string, CardFsrsState>(
    stateRows.map((r: Row) => [r.card_id, mapFsrs(r)]),
  );

  const ordered = orderDeckForPerson({
    cards,
    statesByCardId,
    leadCaseIds,
    cramMode,
  });
  const capped = applyDailyCap(ordered, dailyTarget);

  return {
    cards: capped,
    dailyTarget,
    cramMode,
    daysToCompetition,
    leadCaseCount: leadCaseIds.size,
    totalInRotation: ordered.length,
  };
}
