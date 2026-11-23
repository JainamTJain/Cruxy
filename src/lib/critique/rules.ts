/**
 * Deterministic critique rules. Each rule reads the document, fires only when
 * it finds the problem, and quotes the sentence it is about. They back up the
 * live model (and are the fixed test set so CI needs no model).
 */
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";
import type {
  CritiqueFinding,
  CritiqueKind,
  TruthSourceItem,
} from "@/lib/critique/types";

export type SectionBodies = Record<WorkingSectionKey, string>;

const ASK = "What do you think?";

const STOP = new Set(
  "the a an and or of to in on for with by is are was were be been this that these those it its as at from but not no can could should would will may might do does did has have had their they them we our you your he she his her who which what when where why how than then so if into about over under more most less such any each all some because claim support".split(
    " ",
  ),
);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z][a-z'-]{3,}/g)
      ?.filter((w) => !STOP.has(w)) ?? [],
  );
}

function overlap(a: string, b: string): number {
  const A = terms(a);
  const B = terms(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / Math.min(A.size, B.size);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\s]+/, "").trim())
    .filter((s) => s.length > 3);
}

function quote(s: string, n = 200): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 3).trim()}...` : t;
}

function empty(body: string): boolean {
  return body.trim().length < 12;
}

/** The truth-source item that best matches a passage, for a concrete fix. */
function bestTruth(
  items: TruthSourceItem[],
  about: string,
): TruthSourceItem | null {
  let best: TruthSourceItem | null = null;
  let score = 0;
  for (const it of items) {
    const s = overlap(about, it.text);
    if (s > score) {
      score = s;
      best = it;
    }
  }
  return score > 0.15 ? best : null;
}

/** The one sentence of a source that best fits a passage, cleaned for display. */
function bestSentence(item: TruthSourceItem, about: string): string {
  const parts = item.text
    .replace(/\*\*|__|#+\s*/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.replace(/^[\d.)\s-]+/, "").trim())
    .filter((x) => x.length > 30 && x.length < 300 && !/^claim \d|^logic line|^s\d/i.test(x));
  let best = parts[0] ?? "";
  let score = -1;
  for (const p of parts) {
    const sc = overlap(about, p);
    if (sc > score) {
      score = sc;
      best = p;
    }
  }
  return quote(best, 220);
}

function cite(t: TruthSourceItem | null): Pick<
  CritiqueFinding,
  "truthSourceId" | "cannotCite"
> {
  return { truthSourceId: t?.id ?? null, cannotCite: !t };
}

type Fallacy = { name: string; re: RegExp; why: string; fix: string };

/** Common fallacies the team is taught to catch (reasoning standard). */
const FALLACIES: Fallacy[] = [
  {
    name: "Hasty generalization",
    re: /\b(always|never|all|every|everyone|no one|nobody|none)\b/i,
    why: "An absolute word makes the claim false the moment a judge names one exception.",
    fix: "Narrow it to what the case facts support, for example 'in most cases' or 'in this case', and say which cases you mean.",
  },
  {
    name: "False dilemma",
    re: /\b(either\b.+\bor\b|the only (way|option|choice)|only two)\b/i,
    why: "It offers two options when a judge can name a third, so the conclusion does not follow.",
    fix: "Name the middle option the other side would raise and say why it fails or why you accept part of it.",
  },
  {
    name: "Slippery slope without a stopping point",
    re: /\b(will (inevitably )?lead to|inevitably|opens the door|next thing|before long|slippery slope|end up)\b/i,
    why: "It predicts a chain of results without showing why each step follows or where it would stop.",
    fix: "Show the mechanism for each step, or say where a principled line could be drawn and why it would not hold.",
  },
  {
    name: "Appeal to authority",
    re: /\b(experts? (say|agree|believe)|studies show|research shows|science says|everyone knows|it is well known)\b/i,
    why: "It rests on unnamed authority, which a judge can dismiss in one question.",
    fix: "Name the source and the specific finding, or give the reason the experts give.",
  },
  {
    name: "Post hoc",
    re: /\b(after\b.+\b(so|therefore|thus)\b|since then\b|ever since)\b/i,
    why: "It treats something that came first as the cause without ruling out other causes.",
    fix: "Give the mechanism that links the two, or soften the claim to a correlation.",
  },
  {
    name: "Appeal to tradition",
    re: /\b(has always been|always been done|tradition(ally)?|the way it has always)\b/i,
    why: "That something has long been done is not a reason it is right.",
    fix: "Say what value the practice protects and argue for that value directly.",
  },
];

/** Lines that label structure ("Logic line:", "We concede:") rather than argue. */
function isLabelLine(line: string): boolean {
  return /^(logic line|ethical analysis|we concede|concede|distinguish|rebut|backing|crux|the trap|stakeholders|q|a)\s*:/i.test(
    line.trim(),
  );
}

const FRAMEWORK_RE =
  /\b(kant\w*|utilitarian\w*|consequentialis\w*|virtue ethics|aristotle|mill|rawls|contractualis\w*|care ethics|deontolog\w*|humanity formula|categorical imperative)\b/i;

/**
 * The team's claims. In a structured document they are the "Claim N:" lines;
 * otherwise every sentence in the section counts.
 */
function claimStatements(claims: string): string[] {
  const labelled = claims
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^claim \d+\s*:/i.test(l))
    .map((l) => l.replace(/^claim \d+\s*:\s*/i, ""));
  return labelled.length ? labelled : sentences(claims).filter((l) => !isLabelLine(l));
}

/** Build findings from what the document actually says. */
export function ruleFindings(input: {
  sections: SectionBodies;
  truth: TruthSourceItem[];
}): CritiqueFinding[] {
  const s = input.sections;
  const answer = s.answer_one_sentence ?? "";
  const claims = s.claims ?? "";
  const support = s.support ?? "";
  const objection = s.objection_reply ?? "";
  const values = s.values_in_tension ?? "";
  const judges = s.judges_questions ?? "";
  const out: CritiqueFinding[] = [];
  const truth = input.truth;

  // Logical fallacies: scan the argument sections, one per fallacy type.
  const argumentLines: Array<[WorkingSectionKey, string]> = [
    ...sentences(answer).map((x) => ["answer_one_sentence", x] as [WorkingSectionKey, string]),
    ...sentences(claims).map((x) => ["claims", x] as [WorkingSectionKey, string]),
    ...sentences(support).map((x) => ["support", x] as [WorkingSectionKey, string]),
  ];
  const seenFallacy = new Set<string>();
  const quoted = new Set<string>();
  for (const [key, line] of argumentLines) {
    // Headings, logic lines and framework statements are not empirical claims.
    if (isLabelLine(line) || FRAMEWORK_RE.test(line)) continue;
    for (const f of FALLACIES) {
      if (seenFallacy.has(f.name) || !f.re.test(line)) continue;
      if (f.name === "Hasty generalization" && /never[^.]*merely|not all|\b(may|might|could|often|usually|most|many|tends?)\b/i.test(line)) continue;
      seenFallacy.add(f.name);
      quoted.add(line);
      out.push({
        kind: "logical_fallacy",
        sectionKey: key,
        weakSpot: `"${quote(line)}"`,
        why: f.why,
        stronger: f.fix,
        questionBack: `How would you answer a judge who presses on this? ${ASK}`,
        fallacyName: f.name,
        ...cite(bestTruth(truth, line)),
        rank: 1,
      });
    }
  }

  // Circular support: a support that only restates its claim.
  const claimLines = claimStatements(claims);
  for (const sup of sentences(support).filter((x) => !isLabelLine(x) && !/^claim \d/i.test(x))) {
    const echo = claimLines.find((c) => overlap(c, sup) >= 0.75 && sup.length > 20);
    if (echo) {
      out.push({
        kind: "logical_fallacy",
        sectionKey: "support",
        weakSpot: `"${quote(sup)}" restates "${quote(echo, 90)}"`,
        why: "A support that repeats the claim gives the judge no independent reason to believe it.",
        stronger: "Replace it with a reason that could be true even if someone doubted the claim: a fact from the case, a principle, or a consequence.",
        questionBack: `What would convince someone who does not already agree? ${ASK}`,
        fallacyName: "Circular reasoning",
        ...cite(bestTruth(truth, sup)),
        rank: 1,
      });
      break;
    }
  }

  // Missing link: a claim that asserts a concept none of its premises reach.
  // Premises are the claim's logic line plus every support and backing. If the
  // claim's load-bearing idea never appears below it, the step from the
  // supports to the claim needs an unstated premise.
  {
    const claimBlocks = claims.split(/\n(?=\s*claim \d+\s*:)/i);
    const stem = (w: string) => w.slice(0, 5);
    const supportStems = new Set([...terms(support)].map(stem));
    for (const block of claimBlocks) {
      const head = block.match(/claim \d+\s*:\s*(.+)/i)?.[1]?.trim();
      if (!head || FRAMEWORK_RE.test(head)) continue;
      const logic = block.match(/logic line\s*:\s*(.+)/i)?.[1] ?? "";
      const premiseStems = new Set([...supportStems, ...[...terms(logic)].map(stem)]);
      const jumps = [...terms(head)]
        .filter((w) => w.length >= 7 && !premiseStems.has(stem(w)))
        .sort((x, y) => y.length - x.length);
      if (jumps.length < 2) continue;
      const leap = jumps[0]!;
      out.push({
        kind: "missing_link",
        sectionKey: "claims",
        weakSpot: `"${quote(head)}" rests on "${leap}", but none of its supports or its logic line gets you there.`,
        why: "A judge follows the chain one step at a time. If the supports are all true and the claim could still be false, the step between them is doing work nobody defended.",
        stronger: `Add the bridge as its own line under this claim: "${leap.replace(/^\w/, (c) => c.toUpperCase())} follows from our supports because ..." and name the principle that links them.`,
        questionBack: `If a judge granted every support, what stops them from denying the claim? ${ASK}`,
        fallacyName: null,
        chain: `Supports, then [gap: why do they establish "${leap}"?], then the claim.`,
        ...cite(bestTruth(truth, head)),
        rank: 0,
      });
      break;
    }
  }

  // Disconnected claim: a claim that does not serve the one-sentence answer.
  if (!empty(answer)) {
    for (const c of claimLines.slice(0, 4)) {
      if (c.length > 12 && overlap(c, answer) < 0.15 && !/logic line|concede/i.test(c)) {
        out.push({
          kind: "disconnected_claim",
          sectionKey: "claims",
          weakSpot: `"${quote(c)}" does not connect to your answer "${quote(answer, 90)}"`,
          why: "Judges score whether each claim builds the answer; a claim that floats free looks like a second argument.",
          stronger: "Add a logic line: because this claim is true, our answer follows, and say the bridge in one sentence.",
          questionBack: `What is the bridge from this claim to your answer? ${ASK}`,
          fallacyName: null,
          ...cite(bestTruth(truth, c)),
          rank: 2,
        });
        break;
      }
    }
  }

  // Evidence gap: supports with no backing, source or case fact.
  // A support line followed by a "Backing:" line is already backed.
  const rawLines = support.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const backed = new Set<string>();
  rawLines.forEach((l, i) => {
    if (/^backing\b/i.test(rawLines[i + 1] ?? "") || /^backing\b/i.test(l)) {
      for (const x of sentences(l)) backed.add(x);
    }
  });
  // Prefer a sentence no other suggestion already quotes.
  const supportLines = sentences(support).filter((x) => !backed.has(x));
  const orderedSupport = [...supportLines.filter((x) => !quoted.has(x)), ...supportLines.filter((x) => quoted.has(x))];
  for (const sup of orderedSupport) {
    if (isLabelLine(sup) || /^claim \d/i.test(sup) || /backing:|\(\w[^)]*\d{4}\)|according to|reports?|case text|study|survey|data/i.test(sup)) continue;
    if (sup.length < 25) continue;
    const t = bestTruth(truth, sup);
    out.push({
      kind: "evidence_gap",
      sectionKey: "support",
      weakSpot: `"${quote(sup)}" has no backing`,
      why: "Without a fact, source or case detail behind it, a judge can treat this as opinion.",
      stronger:
        t && bestSentence(t, sup) && overlap(bestSentence(t, sup), sup) < 0.8
          ? `Back it with this from the ${t.label.toLowerCase()}: "${bestSentence(t, sup)}"`
          : "Add one fact from the case or a named source that makes this true, and say where it comes from.",
      questionBack: `Which fact in the case proves this? ${ASK}`,
      fallacyName: null,
      ...cite(t),
      rank: 2,
    });
    break;
  }

  // Unanswered counterargument: an objection with no reply.
  if (empty(objection)) {
    out.push({
      kind: "unanswered_counter",
      sectionKey: "objection_reply",
      weakSpot: "No objection is answered yet",
      why: "The commentary will raise the strongest counterargument; teams score well by answering it before they are asked.",
      stronger: "Write the best objection in their words, then answer it with concede, distinguish or rebut.",
      questionBack: `What is the strongest thing the other team will say? ${ASK}`,
      fallacyName: null,
      ...cite(bestTruth(truth, answer)),
      rank: 1,
    });
  } else if (!/\b(concede|distinguish|rebut|we reply|our answer|in response|but|however)\b/i.test(objection)) {
    const first = sentences(objection)[0] ?? objection;
    out.push({
      kind: "unanswered_counter",
      sectionKey: "objection_reply",
      weakSpot: `"${quote(first)}" is stated but not answered`,
      why: "Naming an objection without answering it hands the other team the point.",
      stronger: "Add one line each: what you concede, how this case is different, and why the objection still fails.",
      questionBack: `Which part of this objection is true? ${ASK}`,
      fallacyName: null,
      ...cite(bestTruth(truth, first)),
      rank: 1,
    });
  }

  // Missing perspective: values that only show our side.
  if (
    empty(values) ||
    !/\b(they|critics|opponents|others|another view|on the other side|those who disagree|the other side)\b/i.test(values)
  ) {
    out.push({
      kind: "missing_perspective",
      sectionKey: "values_in_tension",
      weakSpot: empty(values)
        ? "Values in tension is empty"
        : `"${quote(sentences(values)[0] ?? values)}" names the values but not how the other side weighs them`,
      why: "APPE scores whether you understand why reasonable people disagree, not only your own view.",
      stronger: "Add one sentence that gives the opposing value its strongest form, in their words, then say why you weigh it differently.",
      questionBack: `Why would a thoughtful person land on the other side? ${ASK}`,
      fallacyName: null,
      ...cite(bestTruth(truth, values || answer)),
      rank: 2,
    });
  }

  // Missing stakeholder: no stakeholder list, or no voiceless party.
  const stakeLines = values.split(/\n/).filter((l) => /:/.test(l) && !/^(crux|the trap|stakeholders)\s*:/i.test(l.trim()));
  if (stakeLines.length < 3 || !/\b(future|children|voiceless|unborn|animals|non-?human|those not|absent|bystanders|civilians|public)\b/i.test(values)) {
    out.push({
      kind: "missing_stakeholder",
      sectionKey: "values_in_tension",
      weakSpot:
        stakeLines.length < 3
          ? "Fewer than three stakeholders are named"
          : "No voiceless or absent party is named",
      why: "Judges look for everyone affected, including those who cannot speak for themselves.",
      stronger: "List who gains, who loses, and one party with no voice in the decision, with what each stands to lose.",
      questionBack: `Who is affected but not in the room? ${ASK}`,
      fallacyName: null,
      ...cite(bestTruth(truth, `stakeholders ${answer}`)),
      rank: 2,
    });
  }

  // Loose end: a question raised but not answered.
  const qs = sentences(judges).filter((l) => l.endsWith("?"));
  const hasAnswers = /\bA:\s*\S/.test(judges) || judges.split(/\n/).some((l) => l.trim() && !l.trim().endsWith("?") && !/^Q:/i.test(l.trim()));
  if (empty(judges)) {
    out.push({
      kind: "loose_end",
      sectionKey: "judges_questions",
      weakSpot: "No likely judge questions are prepared",
      why: "The question period is a third of the score; unprepared answers lose the most points.",
      stronger: "Write the three hardest questions a judge could ask and a two-sentence answer to each.",
      questionBack: `What question would you least like to be asked? ${ASK}`,
      fallacyName: null,
      ...cite(null),
      rank: 2,
    });
  } else if (qs.length && !hasAnswers) {
    out.push({
      kind: "loose_end",
      sectionKey: "judges_questions",
      weakSpot: `"${quote(qs[0]!.replace(/^Q:\s*/i, ""))}" has no answer`,
      why: "A question without a prepared answer is where teams lose time and points.",
      stronger: "Add a two-sentence answer under it that ties back to your answer.",
      questionBack: `How would you answer this in thirty seconds? ${ASK}`,
      fallacyName: null,
      ...cite(bestTruth(truth, qs[0]!)),
      rank: 2,
    });
  }

  // Sharper wording: an answer with no reason, or vague words.
  const vague = (answer.match(/\b(very|really|things?|stuff|somehow|kind of|sort of|a lot|clearly|obviously|basically|bad|good)\b/i) ?? [])[0];
  if (!empty(answer) && !/\b(because|since|so that|as it|given|when|if|unless|while|as long as)\b|;/i.test(answer)) {
    out.push({
      kind: "sharper_wording",
      sectionKey: "answer_one_sentence",
      weakSpot: `"${quote(answer)}" gives a verdict but not the reason`,
      why: "Judges remember an answer that carries its reason; a bare verdict sounds like a position, not an argument.",
      stronger: "Rewrite as one sentence: [verdict] because [the value or fact that decides it].",
      questionBack: `What single reason decides this for you? ${ASK}`,
      fallacyName: null,
      ...cite(bestTruth(truth, answer)),
      rank: 3,
    });
  } else if (vague) {
    out.push({
      kind: "sharper_wording",
      sectionKey: "answer_one_sentence",
      weakSpot: `"${vague}" in "${quote(answer, 120)}" is vague`,
      why: "Vague words invite the other team to define them for you.",
      stronger: `Replace "${vague}" with the specific harm, value or fact you mean.`,
      questionBack: `What exactly do you mean by "${vague}"? ${ASK}`,
      fallacyName: null,
      ...cite(bestTruth(truth, answer)),
      rank: 3,
    });
  }

  return out;
}

/** First finding of each kind (tests and quick lookups). */
export function findingsByKind(
  findings: CritiqueFinding[],
): Record<CritiqueKind, CritiqueFinding | undefined> {
  const map = {} as Record<CritiqueKind, CritiqueFinding | undefined>;
  for (const f of findings) if (!map[f.kind]) map[f.kind] = f;
  return map;
}
