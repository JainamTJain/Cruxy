/**
 * Deterministic critique rules (one per kind). Used as stubFallback and as
 * the fixed test set so CI does not need a live model.
 */
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";
import type { CritiqueFinding, CritiqueKind, TruthSourceItem } from "@/lib/critique/types";
import { findCite } from "@/lib/critique/truth-source";

export type SectionBodies = Record<WorkingSectionKey, string>;

function empty(body: string): boolean {
  return !body.trim() || body.trim().length < 12;
}

function pickCite(
  items: TruthSourceItem[],
  needle: string,
): { id: string | null; cannotCite: boolean; ref: string | null } {
  const hit = findCite(items, needle);
  if (!hit) return { id: null, cannotCite: true, ref: null };
  return { id: hit.id, cannotCite: false, ref: hit.label };
}

/** Build one finding of each kind from the document + truth source. */
export function ruleFindings(input: {
  sections: SectionBodies;
  truth: TruthSourceItem[];
}): CritiqueFinding[] {
  const answer = input.sections.answer_one_sentence ?? "";
  const claims = input.sections.claims ?? "";
  const support = input.sections.support ?? "";
  const objection = input.sections.objection_reply ?? "";
  const values = input.sections.values_in_tension ?? "";
  const judges = input.sections.judges_questions ?? "";
  const out: CritiqueFinding[] = [];

  // missing_perspective
  {
    const cite = pickCite(input.truth, "viewpoint");
    out.push({
      kind: "missing_perspective",
      sectionKey: "values_in_tension",
      weakSpot: empty(values)
        ? "Values in tension is empty, so other viewpoints are not on the page."
        : "Your values section names your side more clearly than the side that disagrees.",
      why: "APPE scores awareness of views that weigh heavily for people who disagree.",
      stronger:
        "Add one paragraph that steelmans the opposing value in their own words, then answer it.",
      questionBack:
        "Which opposing value would a hostile judge press first? What do you think?",
      fallacyName: null,
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 1,
    });
  }

  // missing_stakeholder
  {
    const cite = pickCite(input.truth, "stake");
    out.push({
      kind: "missing_stakeholder",
      sectionKey: "claims",
      weakSpot: empty(claims)
        ? "Claims are thin, so affected people are easy to miss."
        : "A stakeholder who lives with the outcome is still silent in your claims.",
      why: "Judges look for who is helped or harmed, not only abstract principles.",
      stronger:
        "Name one silent stakeholder, their stake in one clause, and how your answer serves or costs them.",
      questionBack:
        "Who would feel unheard if they only read your claims? What do you think?",
      fallacyName: null,
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 2,
    });
  }

  // unanswered_counter
  {
    const cite = pickCite(input.truth, "object");
    out.push({
      kind: "unanswered_counter",
      sectionKey: "objection_reply",
      weakSpot: empty(objection)
        ? "There is no objection and reply yet."
        : "The reply restates your view more than it meets the strongest objection.",
      why: "Unanswered counters cost presentation C and judges' Q&A points.",
      stronger:
        "State the strongest counter in one sentence, concede what is fair, then rebut with one cited fact.",
      questionBack:
        "What counter would you least want to hear in Q&A? What do you think?",
      fallacyName: null,
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 1,
    });
  }

  // logical_fallacy
  {
    const cite = pickCite(input.truth, "because");
    out.push({
      kind: "logical_fallacy",
      sectionKey: "support",
      weakSpot: empty(support)
        ? "Support is missing, so any leap from claim to conclusion looks like a fallacy."
        : "A support line slides from a particular fact to a universal duty without a bridge.",
      why: "Judges separate logical flaws from disagreement with your conclusion.",
      stronger:
        "Keep the fact, add the moral bridge in one clause, then state the limited conclusion it earns.",
      questionBack:
        "Where does the leap happen if a judge asks you to slow down? What do you think?",
      fallacyName: "Hasty generalization",
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 2,
    });
  }

  // disconnected_claim
  {
    const cite = pickCite(input.truth, answer.slice(0, 20) || "answer");
    out.push({
      kind: "disconnected_claim",
      sectionKey: "claims",
      weakSpot: empty(answer)
        ? "Without a one-sentence answer, claims have nothing to connect to."
        : "At least one claim does not clearly serve the one-sentence answer.",
      why: "Clarity and systematic presentation need every claim to earn the thesis.",
      stronger: empty(answer)
        ? "Write the one-sentence answer first, then rewrite each claim as a reason that answer is right."
        : `Tie the weakest claim back to: "${answer.slice(0, 120)}".`,
      questionBack:
        "If you dropped that claim, would the answer still stand? What do you think?",
      fallacyName: null,
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 1,
    });
  }

  // loose_end
  {
    const cite = pickCite(input.truth, "question");
    out.push({
      kind: "loose_end",
      sectionKey: "judges_questions",
      weakSpot: empty(judges)
        ? "No judge questions are drafted, so loose ends stay hidden."
        : "A thread you raise is never closed before the next claim.",
      why: "Loose ends become the first follow-up in judges' Q&A.",
      stronger:
        "Pick the open thread, answer it in one sentence, and add that sentence under Questions judges may ask.",
      questionBack: "What would you hope nobody asks? What do you think?",
      fallacyName: null,
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 2,
    });
  }

  // evidence_gap
  {
    const cite = pickCite(input.truth, "fact");
    out.push({
      kind: "evidence_gap",
      sectionKey: "support",
      weakSpot: empty(support)
        ? "Supports have no cited facts yet."
        : "A key support leans on assertion where a case fact or research finding belongs.",
      why: "Research only scores when it deepens the moral analysis.",
      stronger:
        "Replace the thinnest support with one cited fact from the case set or research brief, then say what it changes.",
      questionBack:
        "Which claim would fall if a judge asked for the source? What do you think?",
      fallacyName: null,
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 1,
    });
  }

  // sharper_wording
  {
    const cite = pickCite(input.truth, "thesis");
    out.push({
      kind: "sharper_wording",
      sectionKey: "answer_one_sentence",
      weakSpot: empty(answer)
        ? "The one-sentence answer is missing."
        : "The answer is longer or softer than a judge can write down in the first minute.",
      why: "Clear, systematic openings set the frame for every later score.",
      stronger: empty(answer)
        ? "Write one sentence under 25 words that answers the moderator question and names the duty."
        : "Cut to twelve to twenty words: who owes what to whom, and why.",
      questionBack:
        "Could a judge quote your answer from memory after one hearing? What do you think?",
      fallacyName: null,
      truthSourceId: cite.id,
      cannotCite: cite.cannotCite,
      rank: 1,
    });
  }

  return out;
}

export function findingsByKind(
  findings: CritiqueFinding[],
): Record<CritiqueKind, CritiqueFinding | undefined> {
  const map = {} as Record<CritiqueKind, CritiqueFinding | undefined>;
  for (const f of findings) map[f.kind] = f;
  return map;
}
