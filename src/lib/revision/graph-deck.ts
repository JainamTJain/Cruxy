/**
 * Wave 6 graph-aware flashcard ordering and node mastery.
 * Progress is against the person's own past only.
 */

import type { DeckItem } from "@/lib/revision/deck";

/** Map FSRS grade 1–4 onto a mastery nudge in [-0.25, +0.2]. */
export function masteryDeltaFromGrade(grade: number): number {
  if (grade <= 1) return -0.25;
  if (grade === 2) return -0.05;
  if (grade === 3) return 0.12;
  return 0.2;
}

export function nextMastery(prior: number, grade: number): number {
  const raw = prior + masteryDeltaFromGrade(grade);
  return Math.max(0, Math.min(1, raw));
}

export type GraphDeckCard = {
  id: string;
  case_id: string | null;
  claim_id?: string | null;
};

export type GraphDeckState = {
  card_id: string;
  due: string;
  pinned?: boolean;
  stability?: number;
  reps?: number;
};

/**
 * Order: pinned first, then open-attack cards for lead cases (lowest mastery
 * first), then FSRS due / stability as before. Cram still pulls soon-due
 * lead cards into rotation.
 */
export function orderGraphDeckForPerson<
  TCard extends GraphDeckCard,
  TState extends GraphDeckState,
>(args: {
  cards: TCard[];
  statesByCardId: Map<string, TState>;
  leadCaseIds: Set<string>;
  openAttackClaimIds: Set<string>;
  masteryByClaimId: Map<string, number>;
  cramMode: boolean;
  now?: number;
}): DeckItem<TCard, TState>[] {
  const now = args.now ?? Date.now();
  const dueHorizonMs = args.cramMode ? 3 * 24 * 60 * 60 * 1000 : 0;

  type Ranked = {
    card: TCard;
    state: TState | null;
    dueMs: number;
    pinned: boolean;
    isLead: boolean;
    underAttack: boolean;
    mastery: number;
  };

  const ranked: Ranked[] = [];
  for (const card of args.cards) {
    const state = args.statesByCardId.get(card.id) ?? null;
    const pinned = Boolean(state?.pinned);
    const dueMs = state ? new Date(state.due).getTime() : 0;
    const isLead = Boolean(card.case_id && args.leadCaseIds.has(card.case_id));
    const claimId = card.claim_id ?? null;
    const underAttack =
      Boolean(claimId && args.openAttackClaimIds.has(claimId)) && isLead;
    const isDue = !state || dueMs <= now;
    const cramPull =
      args.cramMode &&
      isLead &&
      state != null &&
      dueMs > now &&
      dueMs <= now + dueHorizonMs;
    // Attacked nodes stay in rotation for leads even if not yet due.
    const attackPull = underAttack && state != null && dueMs > now;
    if (!(isDue || pinned || cramPull || attackPull)) continue;
    ranked.push({
      card,
      state,
      dueMs,
      pinned,
      isLead,
      underAttack,
      mastery: claimId
        ? (args.masteryByClaimId.get(claimId) ?? 0.5)
        : 0.5,
    });
  }

  ranked.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    // Open attacks on lead nodes float up (weaker mastery first).
    if (a.underAttack !== b.underAttack) return a.underAttack ? -1 : 1;
    if (a.underAttack && b.underAttack && a.mastery !== b.mastery) {
      return a.mastery - b.mastery;
    }
    if (a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
    const as = a.state?.stability ?? 0;
    const bs = b.state?.stability ?? 0;
    if (as !== bs) return as - bs;
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    return a.card.id.localeCompare(b.card.id);
  });

  return ranked.map((r) => ({ card: r.card, state: r.state }));
}

/** Priority score for UI / tests: higher = sooner in deck. */
export function graphPriorityScore(args: {
  pinned: boolean;
  underAttack: boolean;
  mastery: number;
  dueMs: number;
  now?: number;
}): number {
  const now = args.now ?? Date.now();
  let score = 0;
  if (args.pinned) score += 1000;
  if (args.underAttack) score += 400 + (1 - args.mastery) * 100;
  const overdueHrs = Math.max(0, (now - args.dueMs) / 3_600_000);
  score += Math.min(200, overdueHrs);
  score += (1 - args.mastery) * 50;
  return score;
}
