import type {
  FeedbackItem,
  BankEntry,
  SkillChart,
  TranscriptLine,
} from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";
import { randomUUID } from "crypto";

/** Every feedback point must link to a transcript line (cite-or-quiet). */
export function feedbackHasCitation(
  item: FeedbackItem,
  lines: TranscriptLine[],
): boolean {
  if (!item.quote_line_id) return false;
  return lines.some((l) => l.id === item.quote_line_id);
}

export function filterCitedFeedback(
  items: FeedbackItem[],
  lines: TranscriptLine[],
): FeedbackItem[] {
  return items.filter((i) => feedbackHasCitation(i, lines));
}

export function updateSkillsAfterRedo(
  chart: SkillChart | null,
  personId: string,
  improved: boolean,
): SkillChart {
  const base: SkillChart = chart ?? {
    person_id: personId,
    skills: {
      answer_first: 5,
      explain_frameworks: 5,
      engage_objections: 5,
      stay_under_time: 5,
      commentary_focus: 5,
    },
    updated_at: nowIso(),
  };
  const skills = { ...base.skills };
  if (improved) {
    skills.answer_first = Math.min(10, (skills.answer_first ?? 5) + 0.5);
    skills.engage_objections = Math.min(
      10,
      (skills.engage_objections ?? 5) + 0.3,
    );
  }
  return { ...base, skills, updated_at: nowIso() };
}

export function proposeBankEntry(opts: {
  lesson: string;
  exampleLineId: string | null;
  why: string;
  improved: string;
  caseId: string | null;
  createdBy: string | null;
}): BankEntry {
  return {
    id: randomUUID(),
    lesson: opts.lesson,
    example_line_id: opts.exampleLineId,
    why: opts.why,
    improved: opts.improved,
    drill_id: null,
    seen_count: 1,
    case_id: opts.caseId,
    created_at: nowIso(),
    created_by: opts.createdBy,
  };
}
