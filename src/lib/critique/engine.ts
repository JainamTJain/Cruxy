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

const llmSchema = z.object({
  findings: z
    .array(
      z.object({
        kind: z.enum(kindTuple),
        section_key: z.enum(sectionTuple),
        /** The exact words from the document this finding is about. */
        quote: z.string().max(300).nullable(),
        weak_spot: z.string().min(8).max(280),
        why: z.string().min(8).max(280),
        stronger: z.string().min(8).max(320),
        question_back: z.string().min(8).max(200),
        fallacy_name: z.string().max(80).nullable(),
        truth_source_id: z.string().nullable(),
      }),
    )
    .max(14),
  /**
   * Ideas the team wrote that are stronger than, or missing from, the truth
   * source, rewritten anonymously. Cruxy adds them to the shared truth source.
   */
  truth_additions: z
    .array(
      z.object({
        section_key: z.enum(sectionTuple),
        text: z.string().min(20).max(400),
      }),
    )
    .max(3)
    .default([]),
});

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
  llm: z.infer<typeof llmSchema>["findings"] | null,
  truth: TruthSourceItem[],
  bodies: SectionBodies,
): CritiqueFinding[] {
  if (!llm?.length) return rules;
  const doc = norm(Object.values(bodies).join(" "));
  const out: CritiqueFinding[] = [];
  const seen = new Set<string>();
  for (const f of llm) {
    const q = f.quote?.trim() ?? "";
    const sectionEmpty = !(bodies[f.section_key] ?? "").trim();
    if (q && !sectionEmpty && !doc.includes(norm(q).slice(0, 60))) continue;
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
      rank: f.kind === "logical_fallacy" || f.kind === "unanswered_counter" ? 1 : 2,
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
}> {
  const truthPack = await buildTruthSource(opts.caseId);
  const bodies = bodiesFromRows(opts.sections);
  const rules = ruleFindings({ sections: bodies, truth: truthPack.items });

  let llmFindings: z.infer<typeof llmSchema>["findings"] | null = null;
  if (!opts.rulesOnly) {
    const filled = WORKING_SECTION_KEYS.map(
      (k) =>
        `${WORKING_SECTION_LABELS[k]}:\n${bodies[k].trim() || "(empty)"}`,
    ).join("\n\n");
    const truthBrief = truthPack.items
      .slice(0, 24)
      .map((t) => `[${t.id}] (${t.kind}) ${t.label}: ${t.text.slice(0, 600)}`)
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
        "Find the real weaknesses, strongest first. Check each of these and report only what is actually wrong:",
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
        "- stronger: a concrete rewrite or addition the team can paste in, using the case facts and the truth source where they help.",
        "- question_back: one Socratic question that ends with What do you think?",
        "- truth_source_id: the id of the truth-source item that backs the stronger version, or null.",
        "Return between 4 and 12 findings when the document has that many real problems; fewer if it is strong. Do not pad.",
        "Kinds: missing_perspective, missing_stakeholder, unanswered_counter, logical_fallacy, disconnected_claim, loose_end, evidence_gap, sharper_wording.",
        "truth_additions: up to 3 ideas this team wrote that are clearly stronger than, or missing from, the truth source (a sharper argument, a better reply to an objection, a stakeholder or analogy the prep lacks). Rewrite each in your own neutral words with no team or person named. Leave it empty if the document only repeats the truth source.",
        "Never name a USC team. Plain words. No em dashes. Ethics over law. Never write an id inside a sentence.",
        "Output JSON only.",
      ].join("\n"),
      user: `Case ${truthPack.caseNumber ?? ""}: ${truthPack.caseTitle ?? ""}\n\nWorking document:\n${filled}\n\nTruth source (shared, anonymous):\n${truthBrief || "(empty)"}`,
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
        })),
      }),
    });
    if (result.ok) {
      llmFindings = result.data.findings;
      // Cruxy edits the shared truth source from the team's strongest ideas.
      const { addTruthAddition } = await import("@/lib/critique/truth-additions");
      for (const a of result.data.truth_additions ?? []) {
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

  const merged = selectForRail(
    mergeFindings(rules, llmFindings, truthPack.items, bodies),
    3,
  );

  // A fresh rail: Cruxy's earlier critique nobody has acted on or discussed
  // is replaced by this run, so suggestions track the current document.
  await retirePendingCritique({ teamId: opts.teamId, caseId: opts.caseId });

  const { posted, skippedCap } = await postSuggestions(
    merged.map((f) => {
      const cite = f.truthSourceId
        ? truthPack.items.find((t) => t.id === f.truthSourceId)
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
      };
    }),
  );

  return {
    findings: merged,
    posted: posted.length,
    skippedCap,
    truthCount: truthPack.items.length,
  };
}
