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
        weak_spot: z.string().min(8).max(280),
        why: z.string().min(8).max(280),
        stronger: z.string().min(8).max(320),
        question_back: z.string().min(8).max(200),
        fallacy_name: z.string().max(80).nullable(),
        truth_source_id: z.string().nullable(),
      }),
    )
    .max(16),
});

function bodiesFromRows(
  rows: { section_key: WorkingSectionKey; body: string }[],
): SectionBodies {
  const out = {} as SectionBodies;
  for (const k of WORKING_SECTION_KEYS) out[k] = "";
  for (const r of rows) out[r.section_key] = r.body ?? "";
  return out;
}

function mergeFindings(
  rules: CritiqueFinding[],
  llm: z.infer<typeof llmSchema>["findings"] | null,
  truth: TruthSourceItem[],
): CritiqueFinding[] {
  if (!llm?.length) return rules;
  const byKind = new Map(rules.map((r) => [r.kind, r]));
  for (const f of llm) {
    const base = byKind.get(f.kind);
    const cite = f.truth_source_id
      ? truth.find((t) => t.id === f.truth_source_id) ?? null
      : (base ? truth.find((t) => t.id === base.truthSourceId) : null);
    byKind.set(f.kind, {
      kind: f.kind,
      sectionKey: f.section_key,
      weakSpot: f.weak_spot,
      why: f.why,
      stronger: f.stronger,
      questionBack: f.question_back,
      fallacyName: f.kind === "logical_fallacy" ? f.fallacy_name : null,
      truthSourceId: cite?.id ?? null,
      cannotCite: !cite,
      rank: base?.rank ?? 2,
    });
  }
  return [...byKind.values()];
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
      .slice(0, 16)
      .map((t) => `[${t.id}] (${t.kind}) ${t.label}: ${t.text.slice(0, 220)}`)
      .join("\n");

    const result = await runAgent({
      agent: "coach",
      feature: "working_doc_critique",
      tier: "strong",
      system: [
        "You are Cruxy reviewing an Ethics Bowl working document.",
        "For each finding: say where the point is weak, why, give a stronger version, then ask What do you think?",
        "Kinds: missing_perspective, missing_stakeholder, unanswered_counter, logical_fallacy, disconnected_claim, loose_end, evidence_gap, sharper_wording.",
        "Cite a truth_source_id from the list when you can; otherwise set it null.",
        "Never name a USC team. Plain words. No em dashes. Ethics over law.",
        "Output JSON only.",
      ].join(" "),
      user: `Case ${truthPack.caseNumber ?? ""}: ${truthPack.caseTitle ?? ""}\n\nWorking document:\n${filled}\n\nTruth source (shared, anonymous):\n${truthBrief || "(empty)"}`,
      schema: llmSchema,
      personId: opts.personId,
      fixtureKey: "working_doc_critique",
      estimatedCostUsd: 0.04,
      stubFallback: () => ({
        findings: rules.map((r) => ({
          kind: r.kind,
          section_key: r.sectionKey,
          weak_spot: r.weakSpot,
          why: r.why,
          stronger: r.stronger,
          question_back: r.questionBack,
          fallacy_name: r.fallacyName,
          truth_source_id: r.truthSourceId,
        })),
      }),
    });
    if (result.ok) llmFindings = result.data.findings;
  }

  const merged = selectForRail(
    mergeFindings(rules, llmFindings, truthPack.items),
  );

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
