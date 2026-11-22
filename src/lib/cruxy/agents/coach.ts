
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import {
  coachCardsSystemPrompt,
  coachSocraticSystemPrompt,
} from "@/lib/cruxy/prompts/coach";
import {
  coachCardsSchema,
  coachSocraticSchema,
  type CoachCardsOutput,
  type CoachSocraticOutput,
} from "@/lib/cruxy/schemas/coach";
import type { CitationSource } from "@/lib/cruxy/citations";

export async function runCoachCards(input: {
  claimText: string;
  truthSnippets: string[];
  personId?: string | null;
  sources?: CitationSource[];
  askFirst?: boolean;
}): Promise<CoachCardsOutput> {
  const fallback = (): CoachCardsOutput => ({
    question_first: input.askFirst === false ? null : "Which fact matters most here?",
    plain_sentence: input.claimText.split(/\s+/).slice(0, 25).join(" "),
    analogies: [
      "Like choosing a tool: the least forceful one that still works.",
      "Like a referee: name the foul before the score.",
    ],
    vivid_example: input.truthSnippets[0] ?? null,
    phrases_to_avoid: ["obviously", "clearly", "just policy"],
    flashcards: [
      {
        front: "State the claim in one plain sentence.",
        back: input.claimText.slice(0, 200),
        citation_ids: [],
      },
    ],
    claims: [],
  });

  const result = await runAgent({
    agent: "coach",
    feature: "coach_cards",
    tier: "small",
    system: coachCardsSystemPrompt(),
    user: `Claim: ${input.claimText}\nEvidence Library:\n${input.truthSnippets.slice(0, 6).join("\n")}`,
    schema: coachCardsSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: "coach_cards",
    estimatedCostUsd: 0.01,
    stubFallback: fallback,
  });

  return result.ok ? result.data : fallback();
}

export async function runCoachSocratic(input: {
  claimMapSummary: string;
  priorAnswer?: string | null;
  personId?: string | null;
  sources?: CitationSource[];
}): Promise<CoachSocraticOutput> {
  const fallback = (): CoachSocraticOutput => ({
    question: "What would the other side say is your weakest support?",
    hint: input.priorAnswer
      ? "Name one stakeholder you left out."
      : null,
    full_answer: null,
    claims: [],
  });

  const result = await runAgent({
    agent: "coach",
    feature: "coach_socratic",
    tier: "strong",
    system: coachSocraticSystemPrompt(),
    user: `Claim map:\n${input.claimMapSummary}\nPrior answer: ${input.priorAnswer ?? "none"}`,
    schema: coachSocraticSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: "coach_socratic",
    estimatedCostUsd: 0.02,
    stubFallback: fallback,
  });

  return result.ok ? result.data : fallback();
}
