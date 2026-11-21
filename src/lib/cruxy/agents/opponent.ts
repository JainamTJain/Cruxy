
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { opponentSystemPrompt } from "@/lib/cruxy/prompts/opponent";
import {
  opponentSchema,
  type OpponentOutput,
} from "@/lib/cruxy/schemas/opponent";
import type { CitationSource } from "@/lib/cruxy/citations";

export async function runOpponent(input: {
  role: "presentation" | "commentary";
  caseTitle: string;
  opposingSummary: string;
  personId?: string | null;
  sources?: CitationSource[];
}): Promise<OpponentOutput> {
  const fallback = (): OpponentOutput => ({
    role: input.role,
    text:
      input.role === "presentation"
        ? `We present the strongest opposing view on ${input.caseTitle}: ${input.opposingSummary.slice(0, 400)}`
        : `Commentary: the presenting team left out the strongest objection. ${input.opposingSummary.slice(0, 300)}`,
    outline: ["Name the crux", "Three supports", "Answer the counterclaim"],
    claims: [],
  });

  const result = await runAgent({
    agent: "opponent",
    feature: "opponent_round",
    tier: "strong",
    system: opponentSystemPrompt(),
    user: `Role: ${input.role}\nCase: ${input.caseTitle}\nOpposing material:\n${input.opposingSummary.slice(0, 4000)}`,
    schema: opponentSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: `opponent_${input.role}`,
    estimatedCostUsd: 0.05,
    stubFallback: fallback,
  });

  return result.ok ? result.data : fallback();
}
