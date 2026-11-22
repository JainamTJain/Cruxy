/**
 * Cruxy action: a member tells Cruxy an idea; Cruxy writes it up as a
 * suggestion with their name for the team to tick or cross on the working document.
 * Same signed preview pattern as roles.assign.
 */
import "server-only";

import { callCruxy } from "@/lib/cruxy/callCruxy";
import { cannotDoYet, type ActPlanResult } from "@/lib/cruxy/actions/types";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { getPersonById, logActivity } from "@/lib/db/repository";
import { insertSuggestion } from "@/lib/db/supabase/working-doc-extra";
import { evaluateAndMaybeTravel } from "@/lib/working-doc/idea-travel";
export type TellIdeaData = {
  caseId: string;
  suggestionText: string;
  kind: "evidence" | "gap" | "counter" | "sharper" | "question";
  rawIdea: string;
};

function parseJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function caseIdFromPage(page: string, explicit: string | null): string | null {
  if (explicit) return explicit;
  const m = page.match(/\/(?:case-brain|team\/cases)\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

function writeUpLocally(
  idea: string,
  name: string,
): { text: string; kind: TellIdeaData["kind"] } {
  const cleaned = idea
    .replace(/^(i think|maybe|what if|idea:|my idea is|tell cruxy)\s*/i, "")
    .trim()
    .replace(/[·—–]/g, ",");
  const text = cleaned.endsWith(".")
    ? `${name}'s idea: ${cleaned}`
    : `${name}'s idea: ${cleaned}.`;
  return { text: text.slice(0, 500), kind: "sharper" };
}

export async function planTellIdea(input: {
  message: string;
  page: string;
  caseId: string | null;
  teamId: string;
  personId: string;
}): Promise<ActPlanResult> {
  const caseId = caseIdFromPage(input.page, input.caseId);
  if (!caseId) {
    return {
      kind: "say",
      text: cannotDoYet(
        "turn your idea into a suggestion",
        "Open the case working document, then tell me the idea again.",
      ),
    };
  }

  const person = await getPersonById(input.personId);
  const name = person?.name?.split(" ")[0] ?? "A teammate";

  let suggestionText = "";
  let kind: TellIdeaData["kind"] = "sharper";

  const res = await callCruxy({
    feature: "cruxy_action_tell_idea",
    tier: "small",
    personId: input.personId,
    messages: [
      {
        role: "system",
        content: [
          "You turn a member's Ethics Bowl idea into a short working-document suggestion.",
          `The person is ${name}. Keep their name in the suggestion so the team knows who said it.`,
          "Phrase it as an idea the team can tick or cross. Plain words. No em dashes. No model names.",
          'Output JSON only: {"suggestion_text": string, "kind": "evidence"|"gap"|"counter"|"sharper"|"question", "is_idea": boolean}',
          "If the message is not offering an idea, set is_idea false.",
        ].join("\n"),
      },
      { role: "user", content: input.message },
    ],
  });

  if (res.ok && !res.stub) {
    const j = parseJson(res.text) as {
      suggestion_text?: string;
      kind?: string;
      is_idea?: boolean;
    } | null;
    if (j && j.is_idea === false) {
      return { kind: "not_action" };
    }
    if (j?.suggestion_text?.trim()) {
      suggestionText = j.suggestion_text.trim().replace(/[·—–]/g, ",");
      if (
        j.kind === "evidence" ||
        j.kind === "gap" ||
        j.kind === "counter" ||
        j.kind === "sharper" ||
        j.kind === "question"
      ) {
        kind = j.kind;
      }
    }
  }

  if (!suggestionText) {
    const local = writeUpLocally(input.message, name);
    suggestionText = local.text;
    kind = local.kind;
  }

  const data: TellIdeaData = {
    caseId,
    suggestionText,
    kind,
    rawIdea: input.message.trim().slice(0, 800),
  };

  return {
    kind: "plan",
    action: "idea.tell",
    summary:
      "I would add this as a suggestion on your team's working document with your name. Nothing changes until you tap Apply.",
    lines: [suggestionText.slice(0, 280)],
    data,
    teamId: input.teamId,
  };
}

export async function applyTellIdea(input: {
  data: TellIdeaData;
  personId: string;
  teamId: string;
}): Promise<{ message: string }> {
  const brief = await ensureTeamBrief({
    teamId: input.teamId,
    caseId: input.data.caseId,
    personId: input.personId,
  });

  const sug = await insertSuggestion({
    case_id: input.data.caseId,
    team_id: input.teamId,
    brief_id: brief.id,
    kind: input.data.kind,
    text: input.data.suggestionText,
    citation: null,
    paragraph_anchor: null,
    section_key: null,
    source: "member",
    truth_item_id: null,
    created_by: input.personId,
  });

  // Score for possible anonymous travel to other teams (never reveals source team).
  void evaluateAndMaybeTravel({
    caseId: input.data.caseId,
    sourceTeamId: input.teamId,
    sourceKind: "told_cruxy",
    sourceRef: sug.id,
    ideaText: input.data.rawIdea || input.data.suggestionText,
    personId: input.personId,
  }).catch(() => undefined);

  await logActivity({
    person_id: input.personId,
    action: "working_doc_idea_told",
    target: sug.id,
    meta: { caseId: input.data.caseId },
  });

  return {
    message:
      "Done. Your idea is on the working document as a suggestion with your name. Teammates can tick or cross it.",
  };
}
