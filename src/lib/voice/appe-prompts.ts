/**
 * Short APPE-style prompt for the natural enrollment part (~20s).
 * Person speaks stance + strongest objection on their lead case.
 */

export function naturalEnrollmentPrompt(opts: {
  caseTitle?: string | null;
}): { title: string; text: string } {
  const caseBit = opts.caseTitle?.trim()
    ? `your lead case (${opts.caseTitle.trim()})`
    : "your lead case";
  return {
    title: "Natural speech",
    text: `In about twenty seconds, say your stance on ${caseBit}, then the strongest objection someone could raise. Speak as you would in practice, not as a script.`,
  };
}

export function competitionVoicePrompt(): { title: string; text: string } {
  return {
    title: "Competition voice",
    text: "In about fifteen seconds, deliver one clear point the way you would to judges: thesis first, then why it matters. Use your competition voice.",
  };
}
