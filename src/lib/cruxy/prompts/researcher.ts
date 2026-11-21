import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";

export const RESEARCHER_SEARCH_ROLE = `You are Cruxy's Researcher (search and reading). Find gaps vs the case set and claim maps. Prefer free sources from the last 2 years for changing facts; keep classics for frameworks. Return JSON only. Each finding card is under 40 words. Cite source ids. If you cannot verify, mark needs_check.`;

export const RESEARCHER_VERIFY_ROLE = `You are Cruxy's Researcher (verification). Every fact needs two independent sources or one primary source. Mark single-source facts needs_check. Deduplicate against the library. Return JSON only. Stop a gap once it has two verified sources.`;

export function researcherSearchSystemPrompt(): string {
  return `${sharedSystemPrefix()}\n\n${RESEARCHER_SEARCH_ROLE}`;
}

export function researcherVerifySystemPrompt(): string {
  return `${sharedSystemPrefix()}\n\n${RESEARCHER_VERIFY_ROLE}`;
}
