import {
  focusLabel,
  formatTailoredLine,
  type LearningProfile,
} from "@/lib/learning/types";

/**
 * Short natural-language summary for Cruxy system context.
 * No secrets; safe to put in prompts.
 */
export function formatLearningProfileSummary(
  profile: LearningProfile | null | undefined,
): string | null {
  if (!profile) return null;

  const tailored = formatTailoredLine(profile);
  const focus = profile.focus_areas.map(focusLabel).join("; ");
  const learned: string[] = [];
  if (profile.learned_prefs.prefer_shorter) learned.push("keep answers short");
  if (profile.learned_prefs.prefer_more_detail) {
    learned.push("offer more detail when asked");
  }
  if (profile.learned_prefs.prefer_example) {
    learned.push("lead with a concrete example");
  }

  const lines = [
    "Adapt explanations to this person's learning profile.",
    tailored ? tailored + "." : null,
    profile.daily_minutes != null
      ? `They have about ${profile.daily_minutes} minutes on a normal weekday.`
      : null,
    focus ? `Focus practice on: ${focus}.` : null,
    profile.explanation_style === "example_first"
      ? "Lead with a real example, then the rule."
      : profile.explanation_style === "steps_first"
        ? "Lead with step-by-step reasoning, then an example."
        : null,
    profile.feedback_tone === "blunt"
      ? "Feedback tone: blunt and plain."
      : profile.feedback_tone === "gentle"
        ? "Feedback tone: gentle, still name the weak spot."
        : null,
    learned.length ? `Learned from use: ${learned.join("; ")}.` : null,
    "Stay plain. Never invent citations.",
  ].filter(Boolean);

  return lines.join("\n");
}

export { formatTailoredLine };
