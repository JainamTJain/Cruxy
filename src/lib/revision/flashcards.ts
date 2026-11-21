import { randomUUID } from "crypto";
import type { Flashcard, TruthItem } from "@/lib/revision/types";
import { nowIso } from "@/lib/utils";

/** Build / refresh flashcards linked to a truth item (cite-or-quiet). */
export function cardFromTruthItem(
  item: TruthItem,
  existing?: Flashcard | null,
): Flashcard {
  const front =
    item.kind === "framework"
      ? `Framework (one sentence): ${item.text.slice(0, 48)}…`
      : item.kind === "quote"
        ? `Who said / where: recall this quote`
        : item.kind === "example"
          ? `Vivid example for this case`
          : `Fact with citation`;

  const back = item.text;
  const now = nowIso();

  if (existing) {
    return {
      ...existing,
      front,
      back,
      citation_ids: item.citation_ids.length
        ? item.citation_ids
        : [item.id],
      claim_id: existing.claim_id ?? null,
      updated_at: now,
    };
  }

  return {
    id: randomUUID(),
    team_id: item.team_id,
    case_id: item.case_id,
    deck: `case-${item.case_id}`,
    front,
    back,
    citation_ids: item.citation_ids.length ? item.citation_ids : [item.id],
    truth_item_id: item.id,
    claim_id: null,
    source_kind: "truth",
    created_at: now,
    created_by: item.created_by,
    updated_at: now,
  };
}

/**
 * Sync flashcards for a team/case from accepted truth items.
 * Changed truth text updates the linked card (Track 3 check).
 */
export function syncFlashcardsFromTruth(
  truthItems: TruthItem[],
  existingCards: Flashcard[],
): { cards: Flashcard[]; updatedIds: string[]; createdIds: string[] } {
  const accepted = truthItems.filter((t) => t.status === "accepted");
  const byTruth = new Map(
    existingCards
      .filter((c) => c.truth_item_id)
      .map((c) => [c.truth_item_id!, c]),
  );

  const keptNonTruth = existingCards.filter((c) => !c.truth_item_id);
  const next: Flashcard[] = [...keptNonTruth];
  const updatedIds: string[] = [];
  const createdIds: string[] = [];

  for (const item of accepted) {
    const prev = byTruth.get(item.id) ?? null;
    const card = cardFromTruthItem(item, prev);
    if (!prev) createdIds.push(card.id);
    else if (prev.back !== card.back || prev.front !== card.front) {
      updatedIds.push(card.id);
    }
    next.push(card);
    byTruth.delete(item.id);
  }

  // Drop cards whose truth item was archived/removed
  return { cards: next, updatedIds, createdIds };
}

/** 90% recalled correctly twice — for roadmap flashcards stage. */
export function flashcardStageComplete(
  reviews: { card_id: string; grade: number }[],
  deckCardIds: string[],
): boolean {
  if (deckCardIds.length === 0) return false;
  const byCard = new Map<string, number>();
  for (const r of reviews) {
    if (!deckCardIds.includes(r.card_id)) continue;
    if (r.grade >= 3) {
      byCard.set(r.card_id, (byCard.get(r.card_id) ?? 0) + 1);
    }
  }
  const mastered = deckCardIds.filter((id) => (byCard.get(id) ?? 0) >= 2);
  return mastered.length / deckCardIds.length >= 0.9;
}
