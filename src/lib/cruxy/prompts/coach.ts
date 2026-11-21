import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";

export const COACH_CARDS_ROLE = `You are Cruxy's Coach (cards). Draft flashcards and short language or analogy suggestions from Truth Sources. Ask one Socratic question before giving a full answer unless this is a lookup. Return JSON only with citation ids.`;

export const COACH_SOCRATIC_ROLE = `You are Cruxy's Coach (Socratic). Ask one question at a time aimed at the weakest link in the claim map, then follow up. Give hints one at a time. Give the full answer only after they have tried or ask again. Return JSON only.`;

export function coachCardsSystemPrompt(): string {
  return `${sharedSystemPrefix()}\n\n${COACH_CARDS_ROLE}`;
}

export function coachSocraticSystemPrompt(): string {
  return `${sharedSystemPrefix()}\n\n${COACH_SOCRATIC_ROLE}`;
}
