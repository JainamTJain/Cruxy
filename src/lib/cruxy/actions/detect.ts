/**
 * Pure detectors for Cruxy page actions. Safe for client and server.
 * Keep these cheap: the drawer uses them to skip ask-first on action requests.
 */

export function looksLikeRolesRequest(message: string): boolean {
  return /\b(assign|give|put|set|make|shuffle|random|split|lead|role|cases?\s+\d)/i.test(
    message,
  );
}

export function looksLikeLeadsCount(message: string): boolean {
  return /\b(who|which)\b/i.test(message) && /\bleads?\b/i.test(message);
}

export function looksLikeBriefDecide(message: string): boolean {
  return (
    /\b(accept|reject|approve|decline|turn down)\b/i.test(message) &&
    /\b(suggestion|proposal|margin|brief)\b/i.test(message)
  );
}

export function looksLikeEvidenceQueue(message: string): boolean {
  return (
    /\b(add|queue|put|save)\b/i.test(message) &&
    /\b(fact|evidence|truth|library)\b/i.test(message)
  );
}

export function looksLikeFlashcards(message: string): boolean {
  return /\b(flash\s*cards?|make cards|key points)\b/i.test(message);
}

export function looksLikeDrillStart(message: string): boolean {
  return (
    /\b(start|begin|run|do)\b/i.test(message) &&
    /\b(drill|10\s*min|ten minute|warm.?up|q\s*and\s*a|judges?)\b/i.test(
      message,
    )
  );
}

export function looksLikeTodayPlan(message: string): boolean {
  return (
    /\b(plan|schedule|what should i do|next)\b/i.test(message) &&
    /\b(20|twenty|minutes?|today|now|first)\b/i.test(message)
  );
}

/** True when the message should go straight to /api/cruxy/act (no ask-first). */
export function looksLikeActRequest(message: string): boolean {
  return (
    looksLikeLeadsCount(message) ||
    looksLikeRolesRequest(message) ||
    looksLikeBriefDecide(message) ||
    looksLikeEvidenceQueue(message) ||
    looksLikeFlashcards(message) ||
    looksLikeDrillStart(message) ||
    looksLikeTodayPlan(message)
  );
}
