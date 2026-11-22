/**
 * Vetted ideas travel (docs/decisions.md): Cruxy scores a team's thought against
 * APPE criteria. Only strong, well supported ideas become anonymous suggestions
 * on other teams' working documents. Score + reason stored for Dr. B.
 */
import "server-only";

import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { listTeams, logActivity } from "@/lib/db/repository";
import {
  insertIdeaTravelScore,
  type IdeaTravelSourceKind,
} from "@/lib/db/supabase/idea-travel-extra";
import { insertSuggestion } from "@/lib/db/supabase/working-doc-extra";
import { ensureTeamBrief as ensureBriefRow } from "@/lib/case-brain/team-brief";

const TRAVEL_MIN_SCORE = 7.5;

const scoreSchema = z.object({
  appe_score: z.number().min(1).max(10),
  would_help_win: z.boolean(),
  well_supported: z.boolean(),
  reason: z.string().min(8).max(600),
  anonymous_suggestion: z.string().min(12).max(500),
  kind: z.enum(["evidence", "gap", "counter", "sharper", "question"]),
});

type ScoreOut = z.infer<typeof scoreSchema>;

const APPE_RUBRIC = [
  "APPE presentation A: clear and systematic answer.",
  "APPE presentation B: central moral dimensions identified and discussed.",
  "APPE presentation C: awareness of other viewpoints, especially those who disagree.",
  "Commentary, response, and judges' Q&A: help the team answer hard questions.",
  "Score 1-10 like the APPE bands (10 exceptional, 7 solid, 5 serious weaknesses).",
  "would_help_win is true only if the idea is strong AND well supported (not vague, not wrong).",
  "anonymous_suggestion: phrase as a helpful idea for another team. Never name a team or person.",
  "Do not invent facts. If unsupported, well_supported false and would_help_win false.",
].join(" ");

function parseFallback(idea: string): ScoreOut {
  const words = idea.trim().split(/\s+/).length;
  const looksThin = words < 12 || /^(idk|maybe|just|dunno)\b/i.test(idea);
  return {
    appe_score: looksThin ? 4 : 6,
    would_help_win: false,
    well_supported: !looksThin,
    reason: looksThin
      ? "Too thin or vague to help another team win under APPE criteria."
      : "Needs clearer moral analysis or support before it should travel.",
    anonymous_suggestion: idea.replace(/[·—–]/g, ",").slice(0, 400),
    kind: "sharper",
  };
}

async function scoreIdea(opts: {
  ideaText: string;
  caseId: string;
  personId: string | null;
}): Promise<ScoreOut> {
  const fallback = () => parseFallback(opts.ideaText);
  const result = await runAgent({
    agent: "analyst",
    feature: "idea_travel_score",
    tier: "strong",
    system: [
      "You are Cruxy scoring whether an Ethics Bowl idea should travel to other USC teams.",
      APPE_RUBRIC,
      "Output JSON only matching the schema.",
    ].join(" "),
    user: `Case id: ${opts.caseId}\nIdea:\n${opts.ideaText}`,
    schema: scoreSchema,
    personId: opts.personId,
    fixtureKey: "idea_travel_score",
    estimatedCostUsd: 0.02,
    stubFallback: fallback,
  });
  return result.ok ? result.data : fallback();
}

/**
 * Score an idea. If it would help win, post anonymous suggestions to other teams.
 * Always stores the audit row for Dr. B.
 */
export async function evaluateAndMaybeTravel(opts: {
  caseId: string;
  sourceTeamId: string;
  sourceKind: IdeaTravelSourceKind;
  sourceRef?: string | null;
  ideaText: string;
  personId: string | null;
}): Promise<{
  traveled: boolean;
  appeScore: number;
  reason: string;
  suggestionIds: string[];
}> {
  const text = opts.ideaText.trim().replace(/[·—–]/g, ",");
  if (text.length < 8) {
    await insertIdeaTravelScore({
      case_id: opts.caseId,
      source_team_id: opts.sourceTeamId,
      source_kind: opts.sourceKind,
      source_ref: opts.sourceRef ?? null,
      idea_text: text || "(empty)",
      appe_score: 1,
      would_help_win: false,
      reason: "Empty or too short to score.",
      traveled: false,
      suggestion_ids: [],
      created_by: opts.personId,
    });
    return { traveled: false, appeScore: 1, reason: "Empty or too short.", suggestionIds: [] };
  }

  const scored = await scoreIdea({
    ideaText: text,
    caseId: opts.caseId,
    personId: opts.personId,
  });

  const mayTravel =
    scored.would_help_win &&
    scored.well_supported &&
    scored.appe_score >= TRAVEL_MIN_SCORE;

  const suggestionIds: string[] = [];
  if (mayTravel) {
    const teams = await listTeams();
    const others = teams.filter((t) => t.id !== opts.sourceTeamId);
    const anonText = scored.anonymous_suggestion
      .replace(/[·—–]/g, ",")
      .replace(/\b(team\s*[123]|inspired by)\b/gi, "another view")
      .trim();

    for (const t of others) {
      const brief = await ensureBriefRow({
        teamId: t.id,
        caseId: opts.caseId,
        personId: opts.personId,
      });
      const sug = await insertSuggestion({
        case_id: opts.caseId,
        team_id: t.id,
        brief_id: brief.id,
        kind: scored.kind,
        text: anonText,
        citation: null,
        paragraph_anchor: null,
        section_key: null,
        source: "cruxy",
        truth_item_id: null,
        created_by: null,
      });
      suggestionIds.push(sug.id);
    }
  }

  await insertIdeaTravelScore({
    case_id: opts.caseId,
    source_team_id: opts.sourceTeamId,
    source_kind: opts.sourceKind,
    source_ref: opts.sourceRef ?? null,
    idea_text: text,
    appe_score: scored.appe_score,
    would_help_win: mayTravel,
    reason: scored.reason.replace(/[·—–]/g, ","),
    traveled: mayTravel,
    suggestion_ids: suggestionIds,
    created_by: opts.personId,
  });

  await logActivity({
    person_id: opts.personId,
    action: mayTravel ? "idea_traveled" : "idea_travel_held",
    target: opts.caseId,
    meta: {
      score: scored.appe_score,
      traveled: mayTravel,
      kind: opts.sourceKind,
    },
  });

  return {
    traveled: mayTravel,
    appeScore: scored.appe_score,
    reason: scored.reason,
    suggestionIds,
  };
}
