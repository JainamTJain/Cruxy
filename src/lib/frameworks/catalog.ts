/**
 * Shared ethics frameworks and Ethics Bowl terms for in-place explainers.
 * Each entry: two plain sentences + a verified SEP or IEP link.
 * Wave 9 I follow-up (migration 00070).
 */

export type FrameworkEntry = {
  id: string;
  /** Display name. */
  term: string;
  /** Match phrases (lowercase). Longer aliases win first. */
  aliases: string[];
  /** Exactly two short plain sentences. */
  explanation: string;
  /** Stanford Encyclopedia or Internet Encyclopedia of Philosophy. */
  sourceUrl: string;
  sourceLabel: "SEP" | "IEP";
};

export const FRAMEWORK_CATALOG: FrameworkEntry[] = [
  {
    id: "kantian-ethics",
    term: "Kantian ethics",
    aliases: [
      "kantian ethics",
      "kant's framework",
      "kant's ethics",
      "kantian",
      "kant",
      "deontology",
      "deontological",
      "deontological ethics",
    ],
    explanation:
      "Right and wrong come from duties we can will as rules for everyone, not from what ends well. People must never be used only as tools for someone else's goal.",
    sourceUrl: "https://plato.stanford.edu/entries/kant-moral/",
    sourceLabel: "SEP",
  },
  {
    id: "categorical-imperative",
    term: "categorical imperative",
    aliases: [
      "categorical imperative",
      "categorical imperatives",
      "universal law",
      "formula of humanity",
    ],
    explanation:
      "Kant's test for a moral rule: act only on a maxim you could will as a law for every person. A shorter form says: treat every person as an end in themselves, never only as a means.",
    sourceUrl: "https://iep.utm.edu/kantview/",
    sourceLabel: "IEP",
  },
  {
    id: "utilitarianism",
    term: "utilitarianism",
    aliases: [
      "utilitarianism",
      "utilitarian",
      "greatest happiness",
      "greatest good",
    ],
    explanation:
      "An act is better when it leads to more overall well-being for everyone affected. Critics ask whose well-being counts and whether some rights should never be traded away.",
    sourceUrl: "https://iep.utm.edu/util-a-r/",
    sourceLabel: "IEP",
  },
  {
    id: "consequentialism",
    term: "consequentialism",
    aliases: ["consequentialism", "consequentialist ethics"],
    explanation:
      "Moral worth hangs on outcomes: the right choice is the one with the best overall results. Utilitarianism is the best-known form, focused on well-being.",
    sourceUrl: "https://plato.stanford.edu/entries/consequentialism/",
    sourceLabel: "SEP",
  },
  {
    id: "virtue-ethics",
    term: "virtue ethics",
    aliases: [
      "virtue ethics",
      "virtue ethic",
      "aristotelian ethics",
      "character ethics",
      "virtues",
    ],
    explanation:
      "Focuses on the kind of person we become: courage, honesty, justice, and other traits practiced over time. A good choice is what a wise, well-formed person would do here.",
    sourceUrl: "https://plato.stanford.edu/entries/ethics-virtue/",
    sourceLabel: "SEP",
  },
  {
    id: "care-ethics",
    term: "care ethics",
    aliases: [
      "care ethics",
      "ethics of care",
      "ethic of care",
      "caring relationship",
    ],
    explanation:
      "Morality starts from concrete relationships and the work of caring for people who depend on us. It asks who is vulnerable here and what attentive care requires.",
    sourceUrl: "https://iep.utm.edu/care-eth/",
    sourceLabel: "IEP",
  },
  {
    id: "contractualism",
    term: "contractualism",
    aliases: ["contractualism", "contractualist", "scanlon"],
    explanation:
      "An act is wrong if it rests on a principle that others could reasonably reject. Justification must be something free and equal people could accept together.",
    sourceUrl: "https://plato.stanford.edu/entries/contractualism/",
    sourceLabel: "SEP",
  },
  {
    id: "contractarianism",
    term: "social contract",
    aliases: [
      "social contract",
      "contractarianism",
      "contractarian",
      "hobbesian",
    ],
    explanation:
      "Moral and political rules are those people would agree to for mutual advantage under fair conditions. It asks what deal free people would strike if they had to live with the result.",
    sourceUrl: "https://plato.stanford.edu/entries/contractarianism/",
    sourceLabel: "SEP",
  },
  {
    id: "rights",
    term: "rights",
    aliases: [
      "rights",
      "human rights",
      "moral rights",
      "right-holder",
      "rights-based",
    ],
    explanation:
      "Rights mark strong claims that others must respect, even when breaking them would help someone else. They set limits on what majority benefit can justify.",
    sourceUrl: "https://plato.stanford.edu/entries/rights/",
    sourceLabel: "SEP",
  },
  {
    id: "double-effect",
    term: "doctrine of double effect",
    aliases: [
      "doctrine of double effect",
      "double effect",
      "principle of double effect",
    ],
    explanation:
      "It can be permissible to cause a bad side effect when you aim at a good end, do not intend the harm, and the good is not achieved by means of the harm. Intent and foresight are pulled apart.",
    sourceUrl: "https://plato.stanford.edu/entries/double-effect/",
    sourceLabel: "SEP",
  },
  {
    id: "moral-luck",
    term: "moral luck",
    aliases: ["moral luck", "resultant luck", "circumstantial luck"],
    explanation:
      "We often judge people by outcomes they could not fully control. That clashes with the idea that blame and praise should track only what was in someone's control.",
    sourceUrl: "https://plato.stanford.edu/entries/moral-luck/",
    sourceLabel: "SEP",
  },
  {
    id: "autonomy",
    term: "autonomy",
    aliases: [
      "autonomy",
      "personal autonomy",
      "respect for autonomy",
      "self-determination",
    ],
    explanation:
      "Autonomy is a person's capacity to set and follow their own ends. Many frameworks treat overriding someone's informed choice as a serious moral cost.",
    sourceUrl: "https://plato.stanford.edu/entries/autonomy-moral/",
    sourceLabel: "SEP",
  },
  {
    id: "paternalism",
    term: "paternalism",
    aliases: ["paternalism", "paternalistic"],
    explanation:
      "Acting for someone's good against their will or without their consent. Defenders say it can protect people from serious harm; critics say it insults their agency.",
    sourceUrl: "https://plato.stanford.edu/entries/paternalism/",
    sourceLabel: "SEP",
  },
  {
    id: "beneficence",
    term: "beneficence",
    aliases: ["beneficence", "duty of beneficence"],
    explanation:
      "A duty to help others and promote their well-being when we reasonably can. It is often weighed against duties not to harm and to respect choice.",
    sourceUrl: "https://plato.stanford.edu/entries/principle-beneficence/",
    sourceLabel: "SEP",
  },
  {
    id: "respect",
    term: "respect for persons",
    aliases: [
      "respect for persons",
      "respect for people",
      "respect persons",
    ],
    explanation:
      "People are owed recognition as beings with dignity and ends of their own. Humiliation, deception, or using someone only as a tool fails that standard.",
    sourceUrl: "https://plato.stanford.edu/entries/respect/",
    sourceLabel: "SEP",
  },
  {
    id: "egalitarianism",
    term: "egalitarianism",
    aliases: ["egalitarianism", "egalitarian", "equality of concern"],
    explanation:
      "People matter equally; unjust gaps in status or resources need a moral reason. Debates turn on what must be equal: welfare, resources, or standing.",
    sourceUrl: "https://plato.stanford.edu/entries/egalitarianism/",
    sourceLabel: "SEP",
  },
  {
    id: "distributive-justice",
    term: "distributive justice",
    aliases: [
      "distributive justice",
      "fair distribution",
      "who gets what",
    ],
    explanation:
      "Asks how benefits and burdens should be shared across a community. Rival views stress need, desert, equality, or what free people would agree to.",
    sourceUrl: "https://plato.stanford.edu/entries/justice-distributive/",
    sourceLabel: "SEP",
  },
  {
    id: "retributive-justice",
    term: "retributive justice",
    aliases: ["retributive justice", "retribution", "just deserts"],
    explanation:
      "Wrongdoers should face a fitting response because they deserve it, not only to deter others. Critics prefer repair, prevention, or restoration.",
    sourceUrl: "https://plato.stanford.edu/entries/justice-retributive/",
    sourceLabel: "SEP",
  },
  {
    id: "natural-law",
    term: "natural law",
    aliases: ["natural law", "natural-law ethics", "natural law ethics"],
    explanation:
      "Moral standards are grounded in human nature and practical reason, not only in human rules. Classic forms connect goods like life, knowledge, and community to what we ought to do.",
    sourceUrl: "https://plato.stanford.edu/entries/natural-law-ethics/",
    sourceLabel: "SEP",
  },
  {
    id: "rawls",
    term: "justice as fairness",
    aliases: [
      "justice as fairness",
      "veil of ignorance",
      "rawls",
      "rawlsian",
      "original position",
    ],
    explanation:
      "Fair principles are those people would choose behind a veil of ignorance about their own place in society. It protects basic liberties and limits inequality that does not help the least advantaged.",
    sourceUrl: "https://plato.stanford.edu/entries/rawls/",
    sourceLabel: "SEP",
  },
  {
    id: "doing-allowing",
    term: "doing versus allowing",
    aliases: [
      "doing versus allowing",
      "doing and allowing",
      "killing and letting die",
      "act and omission",
    ],
    explanation:
      "Many people treat actively causing harm as worse than allowing the same harm to happen. Whether that difference is real shapes triage, rescue, and end-of-life cases.",
    sourceUrl: "https://plato.stanford.edu/entries/doing-allowing/",
    sourceLabel: "SEP",
  },
  {
    id: "moral-dilemmas",
    term: "moral dilemma",
    aliases: ["moral dilemma", "moral dilemmas", "tragic choice"],
    explanation:
      "A situation where every available option seems to violate an important duty. Clear naming of the clash helps judges see what is at stake.",
    sourceUrl: "https://plato.stanford.edu/entries/moral-dilemmas/",
    sourceLabel: "SEP",
  },
  {
    id: "consent",
    term: "consent",
    aliases: ["consent", "informed consent", "valid consent"],
    explanation:
      "Valid consent is a voluntary, informed yes that can change what others may do to or with you. Pressure, deception, or incapacity can make an apparent yes fail.",
    sourceUrl: "https://plato.stanford.edu/entries/consent/",
    sourceLabel: "SEP",
  },
  {
    id: "privacy",
    term: "privacy",
    aliases: ["privacy", "right to privacy", "informational privacy"],
    explanation:
      "Privacy protects control over personal information, spaces, and decisions. Loss of privacy can chill speech, enable domination, and leave people exposed.",
    sourceUrl: "https://plato.stanford.edu/entries/privacy/",
    sourceLabel: "SEP",
  },
  {
    id: "moral-responsibility",
    term: "moral responsibility",
    aliases: [
      "moral responsibility",
      "blameworthy",
      "praiseworthy",
      "accountability",
    ],
    explanation:
      "We hold people responsible when they could understand and control what they did. Excuses and justifications change how much blame is fair.",
    sourceUrl: "https://plato.stanford.edu/entries/moral-responsibility/",
    sourceLabel: "SEP",
  },
  {
    id: "environmental-ethics",
    term: "environmental ethics",
    aliases: [
      "environmental ethics",
      "environmental ethic",
      "climate ethics",
    ],
    explanation:
      "Asks what we owe to non-human nature and to people affected by ecological harm. Duties may run to future generations as well as to living beings now.",
    sourceUrl: "https://plato.stanford.edu/entries/ethics-environmental/",
    sourceLabel: "SEP",
  },
  {
    id: "feminism-ethics",
    term: "feminist ethics",
    aliases: ["feminist ethics", "feminist ethic", "gender ethics"],
    explanation:
      "Examines how gender and power shape moral theories and real practices. It often highlights care, dependency, and voices left out of classic frameworks.",
    sourceUrl: "https://plato.stanford.edu/entries/feminism-ethics/",
    sourceLabel: "SEP",
  },
  {
    id: "business-ethics",
    term: "business ethics",
    aliases: ["business ethics", "corporate ethics"],
    explanation:
      "Applies moral standards to firms, markets, and professional roles. It asks what honesty, fairness, and responsibility require when profit is also a goal.",
    sourceUrl: "https://plato.stanford.edu/entries/ethics-business/",
    sourceLabel: "SEP",
  },
  {
    id: "stakeholder",
    term: "stakeholder",
    aliases: ["stakeholder", "stakeholders"],
    explanation:
      "Anyone with a real interest in how a case turns out, including people with little voice in the story. Naming them keeps the analysis from serving only the loudest party.",
    sourceUrl: "https://plato.stanford.edu/entries/ethics-business/",
    sourceLabel: "SEP",
  },
  {
    id: "values-in-tension",
    term: "values in tension",
    aliases: [
      "values in tension",
      "value conflict",
      "competing values",
      "conflicting values",
    ],
    explanation:
      "Two or more goods that pull in different directions in the same case. Ethics Bowl scoring rewards naming the clash and explaining which value you prioritize and why.",
    sourceUrl: "https://plato.stanford.edu/entries/moral-dilemmas/",
    sourceLabel: "SEP",
  },
];

/** Aliases sorted longest-first for matching. */
let _aliasIndex: { alias: string; entry: FrameworkEntry }[] | null = null;

function aliasIndex() {
  if (_aliasIndex) return _aliasIndex;
  const rows: { alias: string; entry: FrameworkEntry }[] = [];
  for (const entry of FRAMEWORK_CATALOG) {
    const keys = new Set(
      [entry.term, ...entry.aliases].map((s) => s.trim().toLowerCase()),
    );
    for (const alias of keys) {
      if (alias.length < 3) continue;
      rows.push({ alias, entry });
    }
  }
  rows.sort((a, b) => b.alias.length - a.alias.length);
  _aliasIndex = rows;
  return rows;
}

export function getFrameworkById(id: string): FrameworkEntry | null {
  return FRAMEWORK_CATALOG.find((e) => e.id === id) ?? null;
}

export function lookupFramework(phrase: string): FrameworkEntry | null {
  const q = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q || q.length > 80) return null;
  for (const { alias, entry } of aliasIndex()) {
    if (alias === q) return entry;
  }
  for (const { alias, entry } of aliasIndex()) {
    if (q.includes(alias) || alias.includes(q)) return entry;
  }
  return null;
}

export type FrameworkHit = {
  from: number;
  to: number;
  entry: FrameworkEntry;
};

/**
 * First match of each distinct term id in a paragraph (quiet underlining).
 * Longest alias wins at each position.
 */
export function findFrameworkHits(paragraph: string): FrameworkHit[] {
  if (!paragraph) return [];
  const lower = paragraph.toLowerCase();
  const usedRanges: { from: number; to: number }[] = [];
  const seenIds = new Set<string>();
  const hits: FrameworkHit[] = [];

  const overlaps = (from: number, to: number) =>
    usedRanges.some((r) => !(to <= r.from || from >= r.to));

  for (const { alias, entry } of aliasIndex()) {
    if (seenIds.has(entry.id)) continue;
    let start = 0;
    while (start < lower.length) {
      const idx = lower.indexOf(alias, start);
      if (idx < 0) break;
      const end = idx + alias.length;
      // Word-ish boundaries: avoid matching inside longer words.
      const before = idx === 0 ? " " : lower[idx - 1]!;
      const after = end >= lower.length ? " " : lower[end]!;
      const boundaryOk =
        !/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after);
      if (boundaryOk && !overlaps(idx, end)) {
        hits.push({ from: idx, to: end, entry });
        usedRanges.push({ from: idx, to: end });
        seenIds.add(entry.id);
        break;
      }
      start = idx + 1;
    }
  }

  hits.sort((a, b) => a.from - b.from);
  return hits;
}
