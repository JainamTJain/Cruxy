import { runAssistant } from "@/lib/cruxy/agents/assistant";
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
 * Workstream H: uses the Assistant agent (asks before it answers).
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
    return (
      words.some((w) => q.includes(w)) ||
      q
        .split(/\W+/)
        .some((w) => w.length > 4 && t.text.toLowerCase().includes(w))
    );
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

  const truthSources = matched.slice(0, 6).map((t) => ({
    id: t.id,
    text: t.text,
    kind: "truth_item" as const,
  }));

  const reply = await runAssistant({
    question,
    truthSources,
    page: ctx.page,
    highlight: ctx.highlight,
    personId: ctx.personId,
    adminMode: ctx.adminMode,
  });

  return {
    text: reply.questionFirst
      ? reply.text
        ? `${reply.questionFirst}\n\n${reply.text}`
        : reply.questionFirst
      : reply.text,
    citations: reply.citations.map((c) => ({
      id: c.id,
      text: c.text,
      kind: c.kind ?? "truth_item",
    })),
    refusedWithoutSources: reply.quiet,
    stub: reply.stub,
    questionFirst: reply.questionFirst,
  };
}
