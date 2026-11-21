import { callCruxy } from "@/lib/cruxy/callCruxy";
import { listTruthItems } from "@/lib/team/repository";

export type AssistantContext = {
  personId: string;
  teamId: string | null;
  caseId?: string | null;
  page?: string | null;
  highlight?: string | null;
  adminMode?: boolean;
};

export type AssistantReply = {
  text: string;
  citations: { id: string; text: string; kind: string }[];
  refusedWithoutSources: boolean;
  stub: boolean;
  questionFirst: string | null;
};

/**
 * Cite-or-quiet assistant: answers from team Truth Sources first.
 * If none match, refuses with the quiet phrase (does not invent).
 */
export async function askTeamAssistant(
  question: string,
  ctx: AssistantContext,
): Promise<AssistantReply> {
  if (!ctx.teamId) {
    return {
      text: "I couldn't find a source for this. Pick a team context first.",
      citations: [],
      refusedWithoutSources: true,
      stub: false,
      questionFirst: null,
    };
  }

  const truths = await listTruthItems({
    teamId: ctx.teamId,
    caseId: ctx.caseId ?? undefined,
  });

  const q = question.toLowerCase();
  const matched = truths.filter((t) => {
    const words = t.text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);
    return words.some((w) => q.includes(w)) || q.split(/\W+/).some((w) => w.length > 4 && t.text.toLowerCase().includes(w));
  });

  if (matched.length === 0) {
    return {
      text: "I couldn't find a source for this.",
      citations: [],
      refusedWithoutSources: true,
      stub: false,
      questionFirst: null,
    };
  }

  const citations = matched.slice(0, 3).map((t) => ({
    id: t.id,
    text: t.text,
    kind: t.kind,
  }));

  // Ask-before-tell: one question first unless it's a lookup
  const lookup =
    /where|when|who|schedule|code|passcode|drive|link|url/i.test(question);
  const questionFirst = lookup
    ? null
    : "What would the other side say against that?";

  const sourceBlock = citations
    .map((c, i) => `[T${i + 1}] (${c.kind}) ${c.text}`)
    .join("\n");

  const result = await callCruxy({
    feature: "assistant_drawer",
    tier: "small",
    personId: ctx.personId,
    messages: [
      {
        role: "system",
        content:
          "You are Cruxy. Answer only from the provided Truth Sources. Cite [T1], [T2]. Never invent. Short and even-handed.",
      },
      {
        role: "user",
        content: `Page: ${ctx.page ?? "unknown"}\nHighlight: ${ctx.highlight ?? "none"}\nSources:\n${sourceBlock}\n\nQuestion: ${question}`,
      },
    ],
  });

  if (!result.ok) {
    return {
      text: result.reason,
      citations: [],
      refusedWithoutSources: false,
      stub: false,
      questionFirst: null,
    };
  }

  // Even in stub mode, ground the reply in citations
  const grounded =
    result.stub || result.text.includes("[Cruxy")
      ? `From your team's Truth Sources: ${citations[0].text} [${citations.map((_, i) => `T${i + 1}`).join(", ")}]`
      : result.text;

  return {
    text: grounded,
    citations,
    refusedWithoutSources: false,
    stub: result.stub,
    questionFirst,
  };
}
