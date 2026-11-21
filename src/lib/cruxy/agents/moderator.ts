
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { moderatorSystemPrompt } from "@/lib/cruxy/prompts/moderator";
import {
  moderatorSchema,
  type ModeratorOutput,
} from "@/lib/cruxy/schemas/moderator";
import type { CitationSource } from "@/lib/cruxy/citations";

export async function runModerator(input: {
  caseNumber: number;
  caseTitle: string;
  claimSummaries: string[];
  personId?: string | null;
  sources?: CitationSource[];
  liveRound?: boolean;
}): Promise<ModeratorOutput> {
  const fallback = (): ModeratorOutput => ({
    questions: [
      {
        text: `State your view and main reasons on ${input.caseTitle}.`,
        type: "state_view",
        difficulty: 1,
        citation_ids: [],
      },
      {
        text: "What would change if the primary stakeholder fully consented?",
        type: "change_facts",
        difficulty: 2,
        citation_ids: [],
      },
      {
        text: `Closing: given your principle, what do you concede on Case ${input.caseNumber}?`,
        type: "closing",
        difficulty: 2,
        citation_ids: [],
      },
    ],
    claims: [],
  });

  const result = await runAgent({
    agent: "moderator",
    feature: input.liveRound ? "moderator_live" : "moderator_bank",
    tier: "small",
    system: moderatorSystemPrompt(),
    user: `Case ${input.caseNumber}: ${input.caseTitle}\nClaims:\n${input.claimSummaries.join("\n")}`,
    schema: moderatorSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: `moderator_case_${input.caseNumber}`,
    estimatedCostUsd: 0.01,
    stubFallback: fallback,
  });

  return result.ok ? result.data : fallback();
}
