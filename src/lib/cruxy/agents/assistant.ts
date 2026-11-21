
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { assistantSystemPrompt } from "@/lib/cruxy/prompts/assistant";
import {
  assistantSchema,
  type AssistantOutput,
} from "@/lib/cruxy/schemas/assistant";
import { packCruxyContext, type CaseCard, type ClaimMapNode } from "@/lib/cruxy/context";
import type { CitationSource } from "@/lib/cruxy/citations";

export type AssistantAgentReply = {
  text: string;
  questionFirst: string | null;
  quiet: boolean;
  citations: CitationSource[];
  stub: boolean;
};

function isLookup(question: string): boolean {
  return /where|when|who|schedule|code|passcode|drive|link|url|what time/i.test(
    question,
  );
}

export async function runAssistant(input: {
  question: string;
  caseCard?: CaseCard | null;
  claimNodes?: ClaimMapNode[];
  truthSources: CitationSource[];
  page?: string | null;
  highlight?: string | null;
  personId?: string | null;
  reasonStrong?: boolean;
  adminMode?: boolean;
}): Promise<AssistantAgentReply> {
  if (input.truthSources.length === 0 && !input.adminMode) {
    return {
      text: "I couldn't find a source for this.",
      questionFirst: null,
      quiet: true,
      citations: [],
      stub: false,
    };
  }

  const lookup = isLookup(input.question) || Boolean(input.adminMode);
  const sourceBlock = input.truthSources
    .slice(0, 8)
    .map((s, i) => `[${s.id}] (${s.kind ?? "source"} T${i + 1}) ${s.text}`)
    .join("\n");

  let contextMessages: Array<{ role: "system"; content: string }> = [];
  let packedSources: CitationSource[] = [...input.truthSources];

  if (input.caseCard) {
    const packed = await packCruxyContext({
      caseCard: input.caseCard,
      claimNodes: input.claimNodes,
      query: input.question,
      agent: "assistant",
      personId: input.personId,
      includeExamples: true,
    });
    contextMessages = packed.systemMessages.slice(1).map((m) => ({
      role: "system" as const,
      content: m.content,
    }));
    packedSources = [...packedSources, ...packed.sources];
  }

  const fallback = (): AssistantOutput => ({
    question_first: lookup
      ? null
      : "What would the other side say against that?",
    answer: lookup
      ? `From your team's Truth Sources: ${input.truthSources[0]?.text ?? ""}`
      : null,
    quiet: false,
    claims: input.truthSources[0]
      ? [
          {
            text: input.truthSources[0].text,
            citation_ids: [input.truthSources[0].id],
            quote: input.truthSources[0].text.slice(0, 60),
          },
        ]
      : [],
  });

  const result = await runAgent({
    agent: "assistant",
    feature: input.adminMode
      ? "admin_program"
      : input.reasonStrong
        ? "assistant_reason"
        : "assistant_drawer",
    tier: input.reasonStrong ? "strong" : "small",
    system: assistantSystemPrompt(),
    user: `Page: ${input.page ?? "unknown"}\nHighlight: ${input.highlight ?? "none"}\nSources:\n${sourceBlock}\n\nQuestion: ${input.question}`,
    schema: assistantSchema,
    personId: input.personId,
    sources: packedSources,
    contextMessages,
    fixtureKey: "assistant_drawer",
    estimatedCostUsd: 0.01,
    stubFallback: fallback,
  });

  const data = result.ok ? result.data : fallback();
  const cited = packedSources.filter((s) =>
    data.claims.some((c) => c.citation_ids.includes(s.id)),
  );

  if (data.quiet || (!data.answer && !data.question_first)) {
    return {
      text: "I couldn't find a source for this.",
      questionFirst: null,
      quiet: true,
      citations: [],
      stub: result.ok ? result.stub : true,
    };
  }

  // Ask before answer: surface the question first when present.
  if (data.question_first && !lookup) {
    return {
      text: data.answer ?? "",
      questionFirst: data.question_first,
      quiet: false,
      citations: cited,
      stub: result.ok ? result.stub : true,
    };
  }

  return {
    text: data.answer ?? "",
    questionFirst: null,
    quiet: false,
    citations: cited,
    stub: result.ok ? result.stub : true,
  };
}
