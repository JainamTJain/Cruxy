
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { assistantSystemPrompt } from "@/lib/cruxy/prompts/assistant";
import {
  assistantSchema,
  type AssistantOutput,
} from "@/lib/cruxy/schemas/assistant";
import { packCruxyContext, type CaseCard, type ClaimMapNode } from "@/lib/cruxy/context";
import type { CitationSource } from "@/lib/cruxy/citations";
import { EVEN_HANDED_PROMPT_LINE, detectLeanFlag } from "@/lib/cruxy/even-handed";
import { COPYRIGHT_PROMPT_LINE } from "@/lib/cruxy/copyright";
import { fitPhoneAnswer } from "@/lib/cruxy/shorten";

export type AssistantAgentReply = {
  text: string;
  questionFirst: string | null;
  quiet: boolean;
  citations: CitationSource[];
  stub: boolean;
  /** True when the answer was trimmed for phone length (F-026). */
  truncated?: boolean;
  /** Even-handed lean warning (F-024). */
  leanFlag?: string | null;
  wantsMoreAvailable?: boolean;
};

/** Questions that want information, not help thinking: answer directly. */
function isLookup(question: string): boolean {
  return /\b(where|when|who|schedule|code|passcode|drive|link|url|what time|what is|what's|what are|what was|define|definition|meaning of|explain|summar|tell me about|who wrote|what does .* (say|argue|mean)|according to)\b/i.test(
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

  // If the model's reply can't be read, show the best source plainly rather
  // than a generic question.
  const fallback = (): AssistantOutput => ({
    question_first: null,
    answer: input.truthSources[0]
      ? `Here is the closest source I have: ${input.truthSources[0].text.slice(0, 400)}`
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
    system: `${assistantSystemPrompt()}\n\n${EVEN_HANDED_PROMPT_LINE}\n${COPYRIGHT_PROMPT_LINE}`,
    user: `Page: ${input.page ?? "unknown"}\nHighlight: ${input.highlight ?? "none"}\nSources:\n${sourceBlock}\n\nQuestion: ${input.question}${input.reasonStrong ? "\n(User asked for more detail.)" : ""}`,
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

  const rawAnswer = data.answer ?? "";
  const leanFlag = detectLeanFlag(rawAnswer);
  const fitted = input.reasonStrong
    ? { text: rawAnswer, truncated: false }
    : fitPhoneAnswer(rawAnswer);

  // Ask before answer: surface the question first when present.
  if (data.question_first && !lookup) {
    return {
      text: fitted.text,
      questionFirst: data.question_first,
      quiet: false,
      citations: cited,
      stub: result.ok ? result.stub : true,
      truncated: fitted.truncated,
      leanFlag,
      wantsMoreAvailable: fitted.truncated,
    };
  }

  return {
    text: fitted.text,
    questionFirst: null,
    quiet: false,
    citations: cited,
    stub: result.ok ? result.stub : true,
    truncated: fitted.truncated,
    leanFlag,
    wantsMoreAvailable: fitted.truncated,
  };
}
