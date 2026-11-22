/**
 * Plain Ethics Bowl terms for "Explain this term" (Wave 9 I).
 * Soft-merges the shared frameworks catalog (SEP/IEP explainers).
 */

import { lookupFramework } from "@/lib/frameworks/catalog";

export type GlossaryEntry = {
  term: string;
  /** Match aliases (lowercased). */
  aliases?: string[];
  meaning: string;
};

export const ETHICS_GLOSSARY: GlossaryEntry[] = [
  {
    term: "Ethics Bowl",
    aliases: ["ieb", "intercollegiate ethics bowl"],
    meaning:
      "A team debate on real moral cases. Teams present, reply, and answer judges. Scores use APPE criteria, not winners by knockout.",
  },
  {
    term: "APPE",
    aliases: ["association for practical and professional ethics"],
    meaning:
      "The group that runs Intercollegiate Ethics Bowl and publishes the scoring guide judges use.",
  },
  {
    term: "case",
    aliases: ["cases"],
    meaning:
      "A short story about a moral problem the team must reason through. Regionals use a set of twelve cases.",
  },
  {
    term: "claim",
    aliases: ["claims", "thesis"],
    meaning:
      "One clear sentence that says what the team thinks should be done or believed about the case.",
  },
  {
    term: "support",
    aliases: ["supports", "backing"],
    meaning:
      "A reason that backs a claim: a case fact, a source, an example, or a framework in plain words.",
  },
  {
    term: "counterclaim",
    aliases: ["counterclaims", "objection", "counter"],
    meaning:
      "The strongest fair argument against the team's claim, plus how the team answers it.",
  },
  {
    term: "lead",
    aliases: ["leads", "lead 1", "lead 2", "case lead"],
    meaning:
      "A person who owns preparing a case: knows the facts, sources, and how the team will argue it.",
  },
  {
    term: "counter-arguer",
    aliases: ["counter arguer", "counterarguer"],
    meaning:
      "The teammate who builds the strongest case against the team, then helps answer it.",
  },
  {
    term: "supporter",
    aliases: ["supporters"],
    meaning:
      "The teammate who writes and often delivers the short intro and closing for a case.",
  },
  {
    term: "moderator",
    aliases: ["moderators"],
    meaning:
      "The person who asks the opening question in a round and keeps the timed speaking slots.",
  },
  {
    term: "judge card",
    aliases: ["scoring card", "appe card", "score sheet"],
    meaning:
      "The form judges use to score each team on set criteria such as clarity, analysis, and engagement.",
  },
  {
    term: "Team Brief",
    aliases: ["team brief", "case brief"],
    meaning:
      "The team's shared working notes for one case: stance, claims, and what still needs work.",
  },
  {
    term: "Evidence Library",
    aliases: ["evidence library", "truth sources"],
    meaning:
      "Shared facts and citations the team agrees to use. Every public Cruxy answer must point here when it relies on sources.",
  },
  {
    term: "round",
    aliases: ["rounds", "match"],
    meaning:
      "One timed contest between two teams on a drawn case, with presentations, commentary, and judges' questions.",
  },
  {
    term: "conferral",
    aliases: ["confer"],
    meaning:
      "A short huddle so teammates can decide how to answer before speaking again.",
  },
  {
    term: "commentary",
    aliases: ["comment"],
    meaning:
      "The other team's turn to point out the one or two biggest gaps in what was just presented.",
  },
  {
    term: "framework",
    aliases: ["frameworks", "ethical framework"],
    meaning:
      "A clear way of thinking about right and wrong (for example duties or consequences), explained in plain words with its limits.",
  },
  {
    term: "stakeholder",
    aliases: ["stakeholders"],
    meaning:
      "Anyone affected by the case, including people who may not have a voice in the story.",
  },
  {
    term: "Cruxy",
    aliases: ["crux"],
    meaning:
      "Crux's built-in thinking partner. It asks questions, cites sources, and helps the team improve.",
  },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find a glossary meaning for a selected phrase. */
export function lookupGlossary(phrase: string): GlossaryEntry | null {
  const q = normalize(phrase);
  if (!q || q.length > 80) return null;
  for (const entry of ETHICS_GLOSSARY) {
    const keys = [entry.term, ...(entry.aliases ?? [])].map(normalize);
    if (keys.some((k) => k === q || q.includes(k) || k.includes(q))) {
      return entry;
    }
  }
  const fw = lookupFramework(phrase);
  if (fw) {
    return { term: fw.term, aliases: fw.aliases, meaning: fw.explanation };
  }
  return null;
}
