/**
 * Section-by-section critique: makes a case, then asks.
 */
import "server-only";

import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import {
  WORKING_SECTION_KEYS,
  WORKING_SECTION_LABELS,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";
import { formatCritiqueText } from "@/lib/critique/format";
import { ruleFindings, type SectionBodies } from "@/lib/critique/rules";
import { CRITIQUE_KINDS, type CritiqueFinding, type TruthSourceItem } from "@/lib/critique/types";
import { buildTruthSource } from "@/lib/critique/truth-source";
import { postSuggestions } from "@/lib/working-doc/post-suggestions";
import { retirePendingCritique } from "@/lib/db/supabase/working-doc-extra";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";

const kindTuple = CRITIQUE_KINDS as unknown as [
  (typeof CRITIQUE_KINDS)[number],
  ...(typeof CRITIQUE_KINDS)[number][],
];
const sectionTuple = WORKING_SECTION_KEYS as unknown as [
  WorkingSectionKey,
  ...WorkingSectionKey[],
];

const clipStr = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().slice(0, max) : v),
    z.string(),
  );
const optStr = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null),
    z.string().nullable(),
  );

/** One finding. Over-long text is trimmed, missing optional keys become null. */
const findingSchema = z.object({
  kind: z.enum(kindTuple),
  section_key: z.enum(sectionTuple),
  /** The exact words from the document this finding is about. */
  quote: optStr(400),
  weak_spot: clipStr(400).pipe(z.string().min(8)),
  why: clipStr(400).pipe(z.string().min(8)),
  stronger: clipStr(1400).pipe(z.string().min(8)),
  question_back: clipStr(260).pipe(z.string().min(8)),
  fallacy_name: optStr(80),
  truth_source_id: optStr(80),
  chain: optStr(400),
});
type LlmFinding = z.infer<typeof findingSchema>;

const additionSchema = z.object({
  section_key: z.enum(sectionTuple),
  text: clipStr(400).pipe(z.string().min(20)),
});

/**
 * The model's reply is read leniently: one malformed finding is dropped,
 * not the whole review.
 */
const llmSchema = z.object({
  findings: z.array(z.unknown()).default([]),
  truth_additions: z.array(z.unknown()).default([]),
});

const KIND_WORDS: [RegExp, (typeof CRITIQUE_KINDS)[number]][] = [
  [/missing.?link|gap in (the )?(chain|reasoning)|unstated premise|bridge|inference/, "missing_link"],
  [/fallac|circular|dilemma|slope|generali/, "logical_fallacy"],
  [/counter|objection|rebut/, "unanswered_counter"],
  [/stakeholder|voiceless/, "missing_stakeholder"],
  [/perspective|view|other side/, "missing_perspective"],
  [/evidence|backing|support|fact|sufficien/, "evidence_gap"],
  [/disconnect|connect|relevan/, "disconnected_claim"],
  [/loose|question|open/, "loose_end"],
  [/word|clar|vague|sharp/, "sharper_wording"],
];
const SECTION_WORDS: [RegExp, WorkingSectionKey][] = [
  [/answer|one sentence|thesis/, "answer_one_sentence"],
  [/support|backing|evidence/, "support"],
  [/objection|counter|reply/, "objection_reply"],
  [/value|tension|stakeholder/, "values_in_tension"],
  [/judge|question|q ?& ?a/, "judges_questions"],
  [/claim/, "claims"],
];

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return undefined;
}

/** Map the model's wording onto our keys, so a near miss is not thrown away. */
function normalizeFinding(r: unknown): unknown {
  if (!r || typeof r !== "object") return r;
  const o = r as Record<string, unknown>;
  const kindRaw = String(pick(o, "kind", "type", "category") ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const kind = (CRITIQUE_KINDS as readonly string[]).includes(kindRaw)
    ? kindRaw
    : KIND_WORDS.find(([re]) => re.test(kindRaw.replace(/_/g, " ")))?.[1] ?? "sharper_wording";
  const secRaw = String(pick(o, "section_key", "section", "sectionKey") ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const section = (WORKING_SECTION_KEYS as readonly string[]).includes(secRaw)
    ? secRaw
    : SECTION_WORDS.find(([re]) => re.test(secRaw.replace(/_/g, " ")))?.[1] ?? "claims";
  const question = pick(o, "question_back", "questionBack", "question");
  return {
    kind,
    section_key: section,
    quote: pick(o, "quote", "quoted_text", "excerpt", "text") ?? null,
    weak_spot: pick(o, "weak_spot", "weakSpot", "weakness", "issue", "problem"),
    why: pick(o, "why", "why_weak", "whyWeak", "reason", "impact"),
    stronger: pick(o, "stronger", "stronger_version", "strongerVersion", "fix", "rewrite", "suggestion"),
    question_back: question ?? "Which version would you defend in front of a judge? What do you think?",
    fallacy_name: pick(o, "fallacy_name", "fallacyName", "fallacy") ?? null,
    truth_source_id: pick(o, "truth_source_id", "truthSourceId", "source_id") ?? null,
    chain: pick(o, "chain", "logic_chain", "logicChain") ?? null,
  };
}

function readFindings(raw: unknown[], stats?: { firstIssue: string }): LlmFinding[] {
  const out: LlmFinding[] = [];
  for (const r of raw) {
    const p = findingSchema.safeParse(normalizeFinding(r));
    if (p.success) out.push(p.data);
    else if (stats && !stats.firstIssue) {
      const i = p.error.issues[0];
      stats.firstIssue = i ? `${i.path.join(".")}: ${i.message}`.slice(0, 80) : "invalid";
    }
    if (out.length >= 14) break;
  }
  return out;
}

function readAdditions(raw: unknown[]): z.infer<typeof additionSchema>[] {
  return raw
    .map((r) => additionSchema.safeParse(r))
    .filter((p) => p.success)
    .map((p) => p.data!)
    .slice(0, 3);
}

function bodiesFromRows(
  rows: { section_key: WorkingSectionKey; body: string }[],
): SectionBodies {
  const out = {} as SectionBodies;
  for (const k of WORKING_SECTION_KEYS) out[k] = "";
  for (const r of rows) out[r.section_key] = r.body ?? "";
  return out;
}

function norm(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The model's findings lead. Each must quote words that are really in the
 * document (or be about an empty section); invented quotes are dropped.
 * Rules then fill only the kinds the model did not raise.
 */
function mergeFindings(
  rules: CritiqueFinding[],
  llm: LlmFinding[] | null,
  truth: TruthSourceItem[],
  bodies: SectionBodies,
  stats: { dropped: number } = { dropped: 0 },
): CritiqueFinding[] {
  if (!llm?.length) return rules;
  const doc = norm(Object.values(bodies).join(" "));
  const docWords = new Set(doc.split(" "));
  // A quote counts as real when nearly all its words are in the document,
  // so small changes in punctuation or an ellipsis do not drop it.
  const inDoc = (q: string) => {
    const n = norm(q);
    if (doc.includes(n.slice(0, 50))) return true;
    const words = n.split(" ").filter((w) => w.length > 3);
    if (words.length < 3) return false;
    return words.filter((w) => docWords.has(w)).length / words.length >= 0.85;
  };
  const out: CritiqueFinding[] = [];
  const seen = new Set<string>();
  for (const f of llm) {
    const q = f.quote?.trim() ?? "";
    const sectionEmpty = !(bodies[f.section_key] ?? "").trim();
    if (q && !sectionEmpty && !inDoc(q)) {
      stats.dropped += 1;
      continue;
    }
    const key = `${f.kind}:${norm(q || f.weak_spot).slice(0, 50)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cite = f.truth_source_id
      ? truth.find((t) => t.id === f.truth_source_id) ?? null
      : null;
    out.push({
      kind: f.kind,
      sectionKey: f.section_key,
      weakSpot: q && !f.weak_spot.includes(q.slice(0, 20)) ? `"${q}": ${f.weak_spot}` : f.weak_spot,
      why: f.why,
      stronger: f.stronger,
      questionBack: f.question_back,
      fallacyName: f.kind === "logical_fallacy" ? f.fallacy_name : null,
      truthSourceId: cite?.id ?? null,
      cannotCite: !cite,
      chain: f.kind === "missing_link" ? f.chain : null,
      rank:
        f.kind === "missing_link"
          ? 0
          : f.kind === "logical_fallacy" || f.kind === "unanswered_counter"
            ? 1
            : 2,
    });
  }
  if (!out.length) return rules;
  const covered = new Set(out.map((f) => f.kind));
  for (const r of rules) if (!covered.has(r.kind)) out.push({ ...r, rank: r.rank + 1 });
  return out;
}

/** Cap to top findings per section (by rank), overall readable rail. */
export function selectForRail(
  findings: CritiqueFinding[],
  perSection = 5,
): CritiqueFinding[] {
  const buckets = new Map<WorkingSectionKey, CritiqueFinding[]>();
  for (const f of findings) {
    const list = buckets.get(f.sectionKey) ?? [];
    list.push(f);
    buckets.set(f.sectionKey, list);
  }
  const out: CritiqueFinding[] = [];
  for (const [, list] of buckets) {
    list.sort((a, b) => a.rank - b.rank || a.kind.localeCompare(b.kind));
    out.push(...list.slice(0, perSection));
  }
  return out;
}

export async function critiqueWorkingDocument(opts: {
  caseId: string;
  teamId: string;
  personId: string | null;
  sections: { section_key: WorkingSectionKey; body: string }[];
  /** When true, skip the live model and use deterministic rules only. */
  rulesOnly?: boolean;
}): Promise<{
  findings: CritiqueFinding[];
  posted: number;
  skippedCap: number;
  truthCount: number;
  modelNote: string;
}> {
  const truthPack = await buildTruthSource(opts.caseId);
  // The team's own reading room: notes, comments, highlights and imported
  // readings Cruxy digested. Private to this team; cited, never shared.
  const teamReading: TruthSourceItem[] = await import("@/lib/reading/reading-room")
    .then((m) => m.readingNotesForCruxy({ teamId: opts.teamId, caseId: opts.caseId }))
    .then((rows) =>
      rows.slice(0, 30).map((r) => ({ id: r.id, kind: "team_reading" as const, label: r.label, text: r.text, ref: r.id })),
    )
    .catch(() => []);
  const citeable = [...truthPack.items, ...teamReading];
  const bodies = bodiesFromRows(opts.sections);
  const rules = ruleFindings({ sections: bodies, truth: truthPack.items });

  let llmFindings: LlmFinding[] | null = null;
  let modelNote = "rules only";
  if (!opts.rulesOnly) {
    const filled = WORKING_SECTION_KEYS.map(
      (k) =>
        `${WORKING_SECTION_LABELS[k]}:\n${bodies[k].trim() || "(empty)"}`,
    ).join("\n\n");
    const truthBrief = truthPack.items
      .slice(0, 24)
      .map((t) => `[${t.id}] (${t.kind}) ${t.label}: ${t.text.slice(0, 600)}`)
      .join("\n");
    const teamBrief = teamReading
      .map((t) => `[${t.id}] ${t.label}: ${t.text.slice(0, 500)}`)
      .join("\n");

    const result = await runAgent({
      agent: "coach",
      feature: "working_doc_critique",
      tier: "strong",
      system: [
        sharedSystemPrefix(),
        "",
        "Task: you are Cruxy reviewing a team's Ethics Bowl working document like a tough, fair APPE judge and a philosophy coach.",
        "Judges score: clarity and logic of the argument, whether it identifies and weighs the central moral dimensions, awareness of views that weigh heavily for people who disagree, and responsiveness. Aim every finding at a point a judge would actually take off.",
        "First, trace the logic. Before judging anything, rebuild the argument as chains, silently:",
        "- For each claim: list its premises (the supports, with their backing) as A, B, C, then each step the document takes: A so B, B so C, C so the claim, the claim so the one sentence answer.",
        "- Test every single step on its own: if the earlier lines were all true, would this line have to follow? A step that only follows with an unstated premise is a missing link. Name that premise exactly (for example: you need \"if a decision can't be appealed, no one is answerable for it\").",
        "- Check the joins between parts: each claim to the answer, the objection to the claim it attacks, the reply to that exact objection, and each framework to the conclusion it is used for.",
        "- Check the chain is not circular (the conclusion hiding in a premise) and that a key term means the same thing at every step.",
        "For every missing link, report a finding with kind missing_link. Set chain to the short reconstructed chain with the gap marked, in plain words, like: \"Machines can't be punished, so no one is answerable. [Gap: why answerability needs punishment?] So killing must stay with humans.\" Set stronger to the bridging sentence, written so it can be pasted into the document, plus its reason.",
        "Then find the other real weaknesses, strongest first. Check each of these and report only what is actually wrong:",
        "1. Fallacies from the reasoning standard (false dilemma, slippery slope without a stopping point, post hoc, appeal to authority, equivocation on a key term, hasty generalization, circular support, straw man of the other side). Name the fallacy.",
        "2. Supports that fail the acceptable, relevant, sufficient test, or a logic line where the supports could all be true and the claim still false.",
        "3. A claim that does not connect to the one-sentence answer.",
        "4. The strongest objection left unanswered, or answered with a straw man. Run the stress tests: counterexample, flip test, slope test, second order effects, change the facts.",
        "5. Missing stakeholders, especially the voiceless, and values the other side holds that the document ignores.",
        "6. Facts or frameworks asserted without backing, or a framework named but not explained with its limits.",
        "Rules for each finding:",
        "- quote: copy the exact words from the document the finding is about (null only if the section is empty).",
        "- weak_spot: one sentence saying what is wrong with that quote, specific to this case. Never generic advice that would fit any document.",
        "- why: why a judge would mark it down.",
        "- stronger: the exact text to put in the document, written in the team's voice so it can replace the quote word for word (or be added to the section when nothing is quoted). Not advice about what to write: the writing itself. Use case facts and the truth source where they help.",
        "  Depth: never a surface rewording. The stronger version must carry the reasoning ladder in its own words: the reason (why it is true, from the case facts), the principle or value under that reason (why the reason holds), the so what for this case's question, and a short answer to the best objection. Two to five sentences; a bare claim or a softer rephrasing of the quote is not acceptable.",
        "- chain: for missing_link findings, the reconstructed chain with the gap marked; otherwise null.",
        "- question_back: one Socratic question that ends with What do you think?",
        "- truth_source_id: the id of the truth-source item that backs the stronger version, or null.",
        "The team's own reading notes (their sticky notes, comments, highlights and the readings they imported) come with the document. Treat them as the team's thinking in progress: when a note or reading answers a weakness, makes a missing link, or holds an idea the document has not used yet, build the stronger version from it and set truth_source_id to that note's id. Prefer the team's own material over generic points. Never put the team's notes or readings into truth_additions.",
        "Return between 4 and 12 findings when the document has that many real problems; fewer if it is strong. Do not pad.",
        `section_key must be exactly one of: ${WORKING_SECTION_KEYS.map((k) => `${k} (${WORKING_SECTION_LABELS[k]})`).join(", ")}.`,
        "Each finding is an object with exactly these keys: kind, section_key, quote, weak_spot, why, stronger, question_back, fallacy_name, truth_source_id, chain.",
        "Kinds: missing_link, logical_fallacy, disconnected_claim, unanswered_counter, evidence_gap, missing_perspective, missing_stakeholder, loose_end, sharper_wording. Missing links in the main chain come first.",
        "truth_additions: up to 3 ideas this team wrote that are clearly stronger than, or missing from, the truth source (a sharper argument, a better reply to an objection, a stakeholder or analogy the prep lacks). Rewrite each in your own neutral words with no team or person named. Leave it empty if the document only repeats the truth source.",
        "Never name a USC team. Plain words. No em dashes. Ethics over law. Never write an id inside a sentence.",
        "Output JSON only.",
      ].join("\n"),
      user: `Case ${truthPack.caseNumber ?? ""}: ${truthPack.caseTitle ?? ""}\n\nWorking document:\n${filled}\n\nTruth source (shared, anonymous):\n${truthBrief || "(empty)"}${teamBrief ? `\n\nThis team's reading notes and imported readings (private to them):\n${teamBrief}` : ""}`,
      schema: llmSchema,
      personId: opts.personId,
      fixtureKey: "working_doc_critique",
      estimatedCostUsd: 0.08,
      stubFallback: () => ({
        truth_additions: [],
        findings: rules.map((r) => ({
          kind: r.kind,
          section_key: r.sectionKey,
          quote: null,
          weak_spot: r.weakSpot,
          why: r.why,
          stronger: r.stronger,
          question_back: r.questionBack,
          fallacy_name: r.fallacyName,
          truth_source_id: r.truthSourceId,
          chain: r.chain ?? null,
        })),
      }),
    });
    if (!result.ok) modelNote = "model refused";
    else if ((result as { stub?: boolean }).stub) modelNote = "model unreadable";
    if (result.ok && !(result as { stub?: boolean }).stub) {
      const readStats = { firstIssue: "" };
      llmFindings = readFindings(result.data.findings, readStats);
      modelNote = `model=${result.data.findings.length} valid=${llmFindings.length}${readStats.firstIssue ? ` issue=${readStats.firstIssue}` : ""}`;
      // Cruxy edits the shared truth source from the team's strongest ideas.
      const { addTruthAddition } = await import("@/lib/critique/truth-additions");
      for (const a of readAdditions(result.data.truth_additions ?? [])) {
        await addTruthAddition({
          caseId: opts.caseId,
          sectionKey: a.section_key,
          text: a.text,
          personId: opts.personId,
          existingText: truthPack.items.map((t) => t.text),
        }).catch(() => null);
      }
    }
  }

  const mergeStats = { dropped: 0 };
  const merged = selectForRail(
    mergeFindings(rules, llmFindings, citeable, bodies, mergeStats),
    3,
  );
  if (llmFindings) modelNote += ` quoteDropped=${mergeStats.dropped}`;

  // A fresh rail: Cruxy's earlier critique nobody has acted on or discussed
  // is replaced by this run, so suggestions track the current document.
  await retirePendingCritique({ teamId: opts.teamId, caseId: opts.caseId });

  const { posted, skippedCap } = await postSuggestions(
    merged.map((f) => {
      const cite = f.truthSourceId
        ? citeable.find((t) => t.id === f.truthSourceId)
        : null;
      return {
        caseId: opts.caseId,
        teamId: opts.teamId,
        personId: opts.personId,
        kind: f.kind,
        sectionKey: f.sectionKey,
        text: formatCritiqueText(f),
        source: "cruxy" as const,
        citation: cite && !f.cannotCite ? cite.label : null,
        weakSpot: f.weakSpot,
        whyWeak: f.why,
        strongerVersion: f.stronger,
        questionBack: f.questionBack,
        fallacyName: f.fallacyName,
        truthSourceRef: cite?.label ?? null,
        cannotCite: f.cannotCite || !cite,
        logicChain: f.chain ?? null,
      };
    }),
  );

  return {
    findings: merged,
    posted: posted.length,
    skippedCap,
    truthCount: truthPack.items.length,
    modelNote,
  };
}
