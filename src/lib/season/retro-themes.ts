/**
 * Group real judge comments from competition_logs into themes with citations.
 * Never invent comments: only quote what is in the log.
 */
import "server-only";

import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";
import type { CompetitionLogEntry } from "@/lib/types";
import type { RetroCitationQuote } from "@/lib/season/types";
import { replaceRetroThemes } from "@/lib/db/supabase/season-extra";

const themeSchema = z.object({
  themes: z
    .array(
      z.object({
        theme: z.string().max(80),
        summary: z.string().max(400),
        log_ids: z.array(z.string()),
      }),
    )
    .max(8)
    .default([]),
  claims: z.array(citedClaimSchema).default([]),
});

function clipQuote(text: string, max = 180): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}...`;
}

export async function buildRetroThemesFromLogs(input: {
  seasonId: string;
  teamId: string;
  logs: CompetitionLogEntry[];
  personId: string | null;
}): Promise<{ themes: number; stub: boolean }> {
  const withComments = input.logs.filter(
    (l) =>
      l.team_id === input.teamId &&
      (l.judge_comments?.trim() || l.judges_questions?.trim()),
  );
  if (!withComments.length) {
    await replaceRetroThemes({
      seasonId: input.seasonId,
      teamId: input.teamId,
      themes: [],
      createdBy: input.personId,
    });
    return { themes: 0, stub: false };
  }

  const corpus = withComments.map((l) => ({
    log_id: l.id,
    opponent: l.opponent,
    case_number: l.case_number,
    judge_comments: l.judge_comments,
    judges_questions: l.judges_questions,
    result: l.result,
  }));

  const result = await runAgent({
    agent: "analyst",
    feature: "season_retro_themes",
    tier: "small",
    system:
      "You are Cruxy helping a team retrospective. Group the real judge comments into a few themes. Use only the text given. Every theme must cite log_ids that actually appear. Do not invent comments or opponents. Plain words. No em dashes. Return JSON only.",
    user: `Group these regional round comments into themes for the team retro.\n\n${JSON.stringify(corpus)}`,
    schema: themeSchema,
    personId: input.personId,
    fixtureKey: `season_retro_themes_${input.teamId}`,
    estimatedCostUsd: 0.04,
    stubFallback: () => ({
      themes: withComments.slice(0, 3).map((l, i) => ({
        theme: i === 0 ? "Clarity of thesis" : i === 1 ? "Q and A" : "Evidence",
        summary: clipQuote(
          l.judge_comments || l.judges_questions || "Comment recorded.",
        ),
        log_ids: [l.id],
      })),
      claims: [],
    }),
  });

  const allowed = new Set(withComments.map((l) => l.id));
  const byId = new Map(withComments.map((l) => [l.id, l]));
  const themes = (result.ok ? result.data.themes : []).map((t) => {
    const ids = t.log_ids.filter((id) => allowed.has(id));
    const quotes: RetroCitationQuote[] = ids.map((id) => {
      const log = byId.get(id)!;
      return {
        log_id: id,
        quote: clipQuote(
          log.judge_comments || log.judges_questions || "",
        ),
        opponent: log.opponent,
        case_number: log.case_number,
      };
    });
    return {
      theme: t.theme,
      summary: t.summary,
      citation_log_ids: ids,
      citation_quotes: quotes,
    };
  }).filter((t) => t.citation_log_ids.length > 0);

  await replaceRetroThemes({
    seasonId: input.seasonId,
    teamId: input.teamId,
    themes,
    createdBy: input.personId,
  });

  return { themes: themes.length, stub: result.ok ? result.stub : true };
}
