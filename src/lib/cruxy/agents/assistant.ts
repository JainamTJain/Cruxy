
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
import {
  buildSpecificQuestion,
  decideCharacterMode,
  EMPTY_SOURCE_MESSAGE,
  SPEND_CAP_MESSAGE,
  TIMEOUT_MESSAGE,
  isSpendCapError,
  isTimeoutError,
  wantsInformation,
} from "@/lib/cruxy/character";

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
  /** Spend cap, timeout, or other hard refusal. */
  refusedReason?: string | null;
};

function isGenericCannedQuestion(q: string): boolean {
  return (
    /^what would the other side say\b/i.test(q.trim()) ||
    /^which fact matters most here\b/i.test(q.trim()) ||
    /^does that fit your principle in case 12\b/i.test(q.trim())
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
  timedRound?: boolean;
  alreadyAsked?: boolean;
}): Promise<AssistantAgentReply> {
  if (input.truthSources.length === 0 && !input.adminMode) {
    return {
      text: EMPTY_SOURCE_MESSAGE,
      questionFirst: null,
      quiet: true,
      citations: [],
      stub: false,
    };
  }

  const decision = decideCharacterMode({
    question: input.question,
    adminMode: Boolean(input.adminMode),
    timedRound: Boolean(input.timedRound),
    alreadyAsked: Boolean(input.alreadyAsked),
  });
  const lookup =
    decision.mode === "direct" ||
    wantsInformation(input.question) ||
    Boolean(input.adminMode);

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

  const specificAsk =
    decision.mode === "ask"
      ? (decision.question ?? buildSpecificQuestion(input.question))
      : null;

  // If the model's reply can't be read, show the best source plainly rather
  // than a generic question.
  const fallback = (): AssistantOutput => ({
    question_first: lookup ? null : specificAsk,
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

  const routingHint = lookup
    ? "Mode: answer directly. Set question_first to null."
    : `Mode: ask one specific question first, then still answer. Prefer this question_first: ${specificAsk}`;

  const result = await runAgent({
    agent: "assistant",
    feature: input.adminMode
      ? "admin_program"
      : input.reasonStrong
        ? "assistant_reason"
        : "assistant_drawer",
    tier: input.reasonStrong ? "strong" : "small",
    system: `${assistantSystemPrompt()}\n\n${EVEN_HANDED_PROMPT_LINE}\n${COPYRIGHT_PROMPT_LINE}`,
    user: `${routingHint}\nPage: ${input.page ?? "unknown"}\nHighlight: ${input.highlight ?? "none"}\nSources:\n${sourceBlock}\n\nQuestion: ${input.question}${input.reasonStrong ? "\n(User asked for more detail.)" : ""}`,
    schema: assistantSchema,
    personId: input.personId,
    sources: packedSources,
    contextMessages,
    fixtureKey: "assistant_drawer",
    estimatedCostUsd: 0.01,
    stubFallback: fallback,
  });

  if (!result.ok) {
    const reason = result.reason;
    const text = isSpendCapError(reason)
      ? SPEND_CAP_MESSAGE
      : isTimeoutError(reason)
        ? TIMEOUT_MESSAGE
        : reason || EMPTY_SOURCE_MESSAGE;
    return {
      text,
      questionFirst: null,
      quiet: true,
      citations: [],
      stub: false,
      refusedReason: reason,
    };
  }

  const data = result.data;
  const cited = packedSources.filter((s) =>
    data.claims.some((c) => c.citation_ids.includes(s.id)),
  );

  if (data.quiet || (!data.answer && !data.question_first)) {
    return {
      text: EMPTY_SOURCE_MESSAGE,
      questionFirst: null,
      quiet: true,
      citations: [],
      stub: result.stub,
    };
  }

  const rawAnswer = data.answer ?? "";
  const leanFlag = detectLeanFlag(rawAnswer);
  const fitted = input.reasonStrong
    ? { text: rawAnswer, truncated: false }
    : fitPhoneAnswer(rawAnswer);

  // Thinking help: one specific question, then still the answer.
  if (!lookup && (data.question_first || specificAsk)) {
    const qFirst = data.question_first || specificAsk;
    const safeQuestion =
      qFirst && !isGenericCannedQuestion(qFirst)
        ? qFirst
        : specificAsk ?? buildSpecificQuestion(input.question);
    return {
      text: fitted.text,
      questionFirst: safeQuestion,
      quiet: false,
      citations: cited,
      stub: result.stub,
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
    stub: result.stub,
    truncated: fitted.truncated,
    leanFlag,
    wantsMoreAvailable: fitted.truncated,
  };
}
