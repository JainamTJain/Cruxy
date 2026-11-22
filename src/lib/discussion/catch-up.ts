import "server-only";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import {
  getDiscussionVisit,
  listRepliesSince,
  markDiscussionVisit,
} from "@/lib/discussion/repository";
import type { DiscussionCatchUp } from "@/lib/discussion/types";
import { discussionHref } from "@/lib/discussion/types";

/**
 * Cruxy summarises discussion since the person last looked:
 * decided vs still open, with links to each thread.
 */
export async function catchMeUp(input: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<DiscussionCatchUp> {
  const since = await getDiscussionVisit({
    personId: input.personId,
    teamId: input.teamId,
    caseId: input.caseId,
  });

  const bundles = await listRepliesSince({
    teamId: input.teamId,
    caseId: input.caseId,
    since,
  });

  const decided: DiscussionCatchUp["decided"] = [];
  const open: DiscussionCatchUp["open"] = [];

  for (const { thread, replies } of bundles) {
    const href = discussionHref({
      caseId: thread.case_id,
      teamId: thread.team_id,
      kind: thread.kind,
      targetId: thread.target_id,
      threadId: thread.id,
    });
    const joined = replies.map((r) => r.body.toLowerCase()).join(" ");
    const looksDecided =
      /\b(agreed|we decided|decided|settled|locked|final)\b/.test(joined) ||
      /\b(disagree|i disagree|not settled|still open|undecided)\b/.test(
        joined,
      ) === false &&
        replies.length >= 3 &&
        /\b(yes|ok|sounds good|let'?s go)\b/.test(joined);

    const text =
      thread.title ||
      replies[replies.length - 1]?.body.slice(0, 120) ||
      "Thread";

    if (looksDecided) {
      decided.push({ text, threadId: thread.id, href });
    } else {
      open.push({ text, threadId: thread.id, href });
    }
  }

  let summary: string;
  let stub = false;

  if (!bundles.length) {
    summary = since
      ? "Nothing new since you last looked."
      : "No discussion on this case yet. Reply on a note, suggestion or one-pager field to start.";
  } else {
    const lines = bundles.flatMap(({ thread, replies }) =>
      replies.map(
        (r) =>
          `[${thread.kind}/${thread.title}] ${r.person_name ?? "Someone"}: ${r.body}`,
      ),
    );
    const result = await callCruxy({
      feature: "discussion_catch_up",
      tier: "small",
      personId: input.personId,
      estimatedCostUsd: 0.01,
      messages: [
        { role: "system", content: sharedSystemPrefix() },
        {
          role: "system",
          content:
            "You catch a teammate up on case discussion. Separate what the team decided from what is still open. Short plain sentences. No model names. Do not invent decisions. Mention thread titles.",
        },
        {
          role: "user",
          content: [
            since
              ? `Since ${since}, these replies landed:`
              : "First look at this case discussion:",
            ...lines.slice(0, 40),
          ].join("\n"),
        },
      ],
    });

    if (result.ok && !result.stub && result.text.trim()) {
      summary = result.text.trim();
    } else {
      stub = true;
      const decidedLine = decided.length
        ? `Decided: ${decided.map((d) => d.text).join("; ")}.`
        : "Nothing clearly decided yet.";
      const openLine = open.length
        ? `Still open: ${open.map((o) => o.text).join("; ")}.`
        : "No open threads.";
      summary = `${decidedLine} ${openLine}`;
    }
  }

  await markDiscussionVisit({
    personId: input.personId,
    teamId: input.teamId,
    caseId: input.caseId,
  });

  return { since, decided, open, summary, stub };
}
