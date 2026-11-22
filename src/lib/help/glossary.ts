/**
 * Shared product glossary for Wave 9 G.
 * One list for in-page taps and for I's explain-this-term.
 * Meanings stay one line. Source: docs/domain + docs/design/writing.md.
 */

export type GlossaryTerm = {
  id: string;
  /** Display form shown in UI. */
  term: string;
  /** Lowercase aliases that match this term. */
  aliases: string[];
  /** One-line meaning. */
  meaning: string;
};

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: "appe",
    term: "APPE",
    aliases: ["appe", "appe ethics bowl", "intercollegiate ethics bowl"],
    meaning:
      "Association for Practical and Professional Ethics: the group that runs Ethics Bowl.",
  },
  {
    id: "commentary",
    term: "commentary",
    aliases: ["commentary", "comment on the other team"],
    meaning:
      "Your team's short reply to the other team's presentation: one or two big gaps, said collegially.",
  },
  {
    id: "conferral",
    term: "conferral",
    aliases: ["conferral", "confer", "team confer"],
    meaning:
      "Quiet team huddle before an answer. Only one person speaks at a time; regions often allow about one minute.",
  },
  {
    id: "judges-questions",
    term: "judges' questions",
    aliases: [
      "judges' questions",
      "judges questions",
      "judges' q&a",
      "judges qa",
      "judges' q and a",
    ],
    meaning:
      "Each judge asks one question and one follow-up after the teams speak. You may confer briefly first.",
  },
  {
    id: "evidence-library",
    term: "Evidence Library",
    aliases: ["evidence library", "truth sources", "truth source"],
    meaning:
      "Shared facts and citations the team trusts. Claims should rest on these, not on hunches.",
  },
  {
    id: "team-brief",
    term: "Team Brief",
    aliases: ["team brief", "case brief", "case brain doc"],
    meaning:
      "The one place for your team's stance on a case: claims, counters and what still needs work.",
  },
  {
    id: "presentation",
    term: "presentation",
    aliases: ["presentation", "presenting"],
    meaning:
      "Your team's timed opening answer to the moderator's question (often about 7 to 12 minutes).",
  },
  {
    id: "moderator-question",
    term: "moderator question",
    aliases: ["moderator question", "moderator's question"],
    meaning:
      "The question the moderator reads that starts the round. Answer it in the first 30 seconds.",
  },
  {
    id: "spirit-points",
    term: "spirit points",
    aliases: ["spirit points", "spirit"],
    meaning:
      "A 1 to 5 score for respectful, collegial engagement, on a separate sheet from the main card.",
  },
  {
    id: "one-pager",
    term: "one-pager",
    aliases: ["one-pager", "one pager"],
    meaning:
      "A single sheet with your case answer, claims and counters, ready to study and practise from.",
  },
  {
    id: "case-lead",
    term: "case lead",
    aliases: ["case lead", "lead", "leads"],
    meaning:
      "A person who owns a case cold: facts, sources and the main claims. Each case has two leads.",
  },
  {
    id: "cruxy",
    term: "Cruxy",
    aliases: ["cruxy"],
    meaning:
      "Crux's helper. Asks before it answers and cites sources when it can.",
  },
];

export function findGlossaryTerm(query: string): GlossaryTerm | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    GLOSSARY.find(
      (t) =>
        t.term.toLowerCase() === q ||
        t.id === q ||
        t.aliases.some((a) => a === q),
    ) ?? null
  );
}

export function searchGlossary(query: string): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  if (!q) return GLOSSARY;
  return GLOSSARY.filter(
    (t) =>
      t.term.toLowerCase().includes(q) ||
      t.meaning.toLowerCase().includes(q) ||
      t.aliases.some((a) => a.includes(q)),
  );
}
