import { runAssistant } from "@/lib/cruxy/agents/assistant";
import {
  getCurrentClaimMap,
  homeDiffsForPerson,
  listTruthItems,
  teamBoardSnapshot,
} from "@/lib/team/repository";

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

type Intent =
  | "explain"
  | "quiz"
  | "find"
  | "draft"
  | "summarize"
  | "next"
  | "general";

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/quiz|test me|ask me/i.test(q)) return "quiz";
  if (/draft|one.?pager row|write a row/i.test(q)) return "draft";
  if (/summar|what changed|since (my|i)|last visit/i.test(q)) return "summarize";
  if (/what (should|do) i|next step|what next/i.test(q)) return "next";
  if (/find (a )?source|where (is|can)|look up/i.test(q)) return "find";
  if (/explain|what does|mean|passage/i.test(q)) return "explain";
  return "general";
}

/**
 * Cite-or-quiet assistant: answers from team Truth Sources first.
 * Workstream H: uses the Assistant agent (asks before it answers).
 * F-176: explain, quiz, find, draft, summarize, next.
 * F-179–183: admin mode answers from Crux records only.
 */
export async function askTeamAssistant(
  question: string,
  ctx: AssistantContext,
): Promise<AssistantReply> {
  if (ctx.adminMode) {
    const { answerProgramQuestion } = await import(
      "@/lib/team/program-assistant"
    );
    const admin = await answerProgramQuestion({
      question,
      personId: ctx.personId,
    });
    return {
      text: admin.text,
      citations: admin.numbers.map((n, i) => ({
        id: `num-${i}`,
        text: n,
        kind: "program_record",
      })),
      refusedWithoutSources: false,
      stub: admin.stub,
      questionFirst: null,
    };
  }

  if (!ctx.teamId) {
    return {
      text: "I couldn't find a source for this. Pick a team context first.",
      citations: [],
      refusedWithoutSources: true,
      stub: false,
      questionFirst: null,
    };
  }

  const intent = detectIntent(question);

  if (intent === "summarize") {
    const diffs = await homeDiffsForPerson(ctx.personId);
    if (!diffs.length) {
      return {
        text: "Nothing new on your cases since your last confirm. When a claim map changes, the short diff will show here.",
        citations: [],
        refusedWithoutSources: false,
        stub: false,
        questionFirst: null,
      };
    }
    const lines = diffs.map(
      (d) =>
        `Case update v${d.version}: ${d.change_summary}. Was "${d.old_text}", now "${d.new_text}".${d.confirmed ? " You confirmed." : " Still needs your confirm."}`,
    );
    return {
      text: `Here's what changed:\n\n${lines.join("\n\n")}`,
      citations: diffs.map((d) => ({
        id: d.version_id,
        text: d.change_summary,
        kind: "claim_map_version",
      })),
      refusedWithoutSources: false,
      stub: false,
      questionFirst: null,
    };
  }

  if (intent === "next") {
    const board = await teamBoardSnapshot(ctx.teamId);
    const gaps = board.cases.filter(
      (row) =>
        !board.roles.some(
          (r) => r.case_id === row.case.id && r.role === "lead_1",
        ),
    );
    const behind = board.cases.filter((row) => {
      if (!row.current) return false;
      return row.confirmations.length < board.people.length;
    });
    const parts: string[] = [];
    if (gaps.length) {
      parts.push(
        `Fill the lead gap on Case ${gaps[0].case.number} (${gaps[0].case.title}).`,
      );
    }
    if (behind.length) {
      parts.push(
        `Confirm the latest version on Case ${behind[0].case.number} so the room is on the same page.`,
      );
    }
    if (!parts.length) {
      parts.push(
        "Roles look filled and versions are confirmed. Pick a case and run a short alignment check, or Assign the next prep task.",
      );
    }
    return {
      text: `What to do next:\n\n${parts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
      citations: [],
      refusedWithoutSources: false,
      stub: false,
      questionFirst: null,
    };
  }

  if (intent === "draft" && ctx.caseId) {
    const map = await getCurrentClaimMap(ctx.teamId, ctx.caseId);
    if (!map?.body.claims[0]) {
      return {
        text: "No claim map yet to draft from. Publish a version first, then ask me again.",
        citations: [],
        refusedWithoutSources: false,
        stub: false,
        questionFirst: null,
      };
    }
    const c = map.body.claims[0];
    const draft = [
      "Draft one-pager row (for your review, not published):",
      `Claim: ${c.text}`,
      `Logic line: ${c.logic_line}`,
      `Supports: ${c.supports.map((s) => s.text).join(" | ") || "(add supports)"}`,
      c.counterclaim_response
        ? `Counterclaim answer: ${c.counterclaim_response}`
        : "Counterclaim answer: (still empty)",
    ].join("\n");
    return {
      text: draft,
      citations: [
        {
          id: map.id,
          text: map.change_summary,
          kind: "claim_map_version",
        },
      ],
      refusedWithoutSources: false,
      stub: false,
      questionFirst: "Want this row tightened for plain speech, or kept as-is?",
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

  const pool = matched.length ? matched : intent === "find" ? truths : matched;
  if (pool.length === 0) {
    return {
      text: "I couldn't find a source for this.",
      citations: [],
      refusedWithoutSources: true,
      stub: false,
      questionFirst: null,
    };
  }

  const intentHint =
    intent === "quiz"
      ? "Ask one short quiz question from the sources; do not give the answer yet."
      : intent === "explain"
        ? "Explain the passage in plain words, then stop."
        : intent === "find"
          ? "Point to the best matching source and quote a short line."
          : "";

  const truthSources = pool.slice(0, 6).map((t) => ({
    id: t.id,
    text: t.text,
    kind: "truth_item" as const,
  }));

  const reply = await runAssistant({
    question: intentHint ? `${intentHint}\n\n${question}` : question,
    truthSources,
    page: ctx.page,
    highlight: ctx.highlight,
    personId: ctx.personId,
    adminMode: false,
  });

  const citations =
    reply.citations.length > 0
      ? reply.citations.map((c) => ({
          id: c.id,
          text: c.text,
          kind: c.kind ?? "truth_item",
        }))
      : truthSources.map((s) => ({
          id: s.id,
          text: s.text,
          kind: s.kind,
        }));

  return {
    text: reply.questionFirst
      ? reply.text
        ? `${reply.questionFirst}\n\n${reply.text}`
        : reply.questionFirst
      : reply.text,
    citations: reply.quiet ? [] : citations,
    refusedWithoutSources: reply.quiet,
    stub: reply.stub,
    questionFirst: reply.questionFirst,
  };
}
