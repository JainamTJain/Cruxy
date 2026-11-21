/**
 * Daily flashcard target and cram-mode rules (Wave 4).
 * Progress is against the person's own past only; targets rise as the
 * regional nears, with cram in the last 7 days for cases they lead.
 */

export type DeckItem<TCard, TState> = {
  card: TCard;
  state: TState | null;
};

export function daysUntil(dateIso: string | null | undefined, now = Date.now()): number | null {
  if (!dateIso) return null;
  const t = new Date(dateIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now) / (1000 * 60 * 60 * 24)));
}

/** Base 15; rises as competition nears; cram bump for lead cases in last 7 days. */
export function dailyFlashcardTarget(args: {
  daysToCompetition: number | null;
  leadCaseCount: number;
  cramMode: boolean;
}): number {
  const leads = Math.max(0, args.leadCaseCount);
  const days = args.daysToCompetition;
  let base = 15;
  if (days == null) base = 15;
  else if (days <= 7) base = 35;
  else if (days <= 14) base = 28;
  else if (days <= 21) base = 22;
  else if (days <= 30) base = 18;
  if (args.cramMode) {
    base += 5 + leads * 5;
  }
  return Math.min(80, Math.max(10, base));
}

export function isCramMode(daysToCompetition: number | null): boolean {
  return daysToCompetition != null && daysToCompetition <= 7;
}

/**
 * Order: pinned due first, then other due by earliest due / new cards,
 * then (in cram) not-yet-due lead cards by soonest due.
 */
export function orderDeckForPerson<
  TCard extends { id: string; case_id: string | null },
  TState extends {
    card_id: string;
    due: string;
    pinned?: boolean;
    stability?: number;
    reps?: number;
  },
>(args: {
  cards: TCard[];
  statesByCardId: Map<string, TState>;
  leadCaseIds: Set<string>;
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
    inRotation: boolean;
    isLead: boolean;
  };

  const ranked: Ranked[] = [];
  for (const card of args.cards) {
    const state = args.statesByCardId.get(card.id) ?? null;
    const pinned = Boolean(state?.pinned);
    const dueMs = state ? new Date(state.due).getTime() : 0;
    const isLead = Boolean(card.case_id && args.leadCaseIds.has(card.case_id));
    const isDue = !state || dueMs <= now;
    const cramPull =
      args.cramMode &&
      isLead &&
      state != null &&
      dueMs > now &&
      dueMs <= now + dueHorizonMs;
    const inRotation = isDue || pinned || cramPull;
    if (!inRotation) continue;
    ranked.push({ card, state, dueMs, pinned, inRotation, isLead });
  }

  ranked.sort((a, b) => {
    // Pinned cards that are due (or always kept) float near the front of their due band
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
    // Lower stability first when due times match (weaker recall)
    const as = a.state?.stability ?? 0;
    const bs = b.state?.stability ?? 0;
    if (as !== bs) return as - bs;
    return a.card.id.localeCompare(b.card.id);
  });

  return ranked.map((r) => ({ card: r.card, state: r.state }));
}

/** Cap the session list to today's target (pinned always included). */
export function applyDailyCap<
  TCard extends { id: string },
  TState extends { pinned?: boolean } | null,
>(
  items: DeckItem<TCard, TState>[],
  dailyTarget: number,
): DeckItem<TCard, TState>[] {
  if (items.length <= dailyTarget) return items;
  const pinned = items.filter((i) => i.state?.pinned);
  const rest = items.filter((i) => !i.state?.pinned);
  const room = Math.max(0, dailyTarget - pinned.length);
  return [...pinned, ...rest.slice(0, room)];
}
