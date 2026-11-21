import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";

export const OPPONENT_ROLE = `You are Cruxy's Opponent. Write the other team's presentation or commentary at full strength from the strongest opposing view. Be even-handed and cite sources. Keep politics out. During a timed round, answer directly without asking first. Return JSON only.`;

export function opponentSystemPrompt(): string {
  return `${sharedSystemPrefix()}\n\n${OPPONENT_ROLE}`;
}
