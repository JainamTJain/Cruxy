/**
 * "Tell Cruxy an idea": Cruxy researches the idea before it reaches the team.
 *
 * It searches the case's truth source and the team's library for support and
 * pushback, works out where the idea sits in the team's chain of reasoning,
 * and drafts text the team can Take straight into the document. The idea stays
 * credited to the person who had it.
 */
import "server-only";

import { z } from "zod";
import { buildTruthSource } from "@/lib/critique/truth-source";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import { searchLibraryUnified } from "@/lib/db/supabase/library-search-extra";
import {
  listWorkingSections,
  WORKING_SECTION_KEYS,
  WORKING_SECTION_LABELS,
  type WorkingSectionKey,
  type WorkingSuggestionRow,
} from "@/lib/db/supabase/working-doc-extra";

const sectionTuple = WORKING_SECTION_KEYS as unknown as [
  WorkingSectionKey,
  ...WorkingSectionKey[],
];

const clip = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, max) : v), z.string());
const optClip = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null),
    z.string().nullable(),
  );

const draftSchema = z.object({
  section_key: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : v),
    z.enum(sectionTuple).catch("claims"),
  ),
  /** How it connects to the team's chain: which step it supports, adds or repairs. */
  fit: clip(400).pipe(z.string().min(10)),
  /** Text ready to Take into that section, in the team's voice. */
  draft: clip(900).pipe(z.string().min(10)),
  /** The sentence it would replace, copied exactly, or null when it is new. */
  replaces: optClip(400),
  /** What a judge would push on, and the evidence still needed. */
  risk: clip(400).pipe(z.string().min(8)),
  question_back: clip(260).pipe(z.string().min(8)),
  truth_source_id: optClip(80),
  verdict: z
    .preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(["strengthens", "repeats", "conflicts"]))
    .catch("strengthens"),
});

export type IdeaDraft = {
  sectionKey: WorkingSectionKey;
  kind: WorkingSuggestionRow["kind"];
  text: string;
  weakSpot: string | null;
  why: string;
  stronger: string;
  questionBack: string;
  citation: string | null;
};

const KIND_FOR_SECTION: Record<WorkingSectionKey, WorkingSuggestionRow["kind"]> = {
  answer_one_sentence: "sharper",
  claims: "sharper",
  support: "evidence",
  objection_reply: "counter",
  values_in_tension: "missing_perspective",
  judges_questions: "question",
};

/** Research, place and draft one idea. Returns null if Cruxy can't run. */
export async function draftIdea(opts: {
  caseId: string;
  briefId: string;
  teamId: string;
  personId: string;
  name: string;
  idea: string;
}): Promise<IdeaDraft | null> {
  const [sections, truth] = await Promise.all([
    listWorkingSections(opts.briefId),
    buildTruthSource(opts.caseId),
  ]);
  // Library: only shared sources and this team's own notes.
  const hits = await searchLibraryUnified({
    q: opts.idea.slice(0, 300),
    caseNumber: truth.caseNumber ?? undefined,
    teamId: opts.teamId,
    personId: opts.personId,
    limit: 8,
  }).catch(() => []);
  const library = hits
    .filter((h) => (h.kind === "passage" || h.kind === "truth") && (!h.team_id || h.team_id === opts.teamId))
    .slice(0, 6)
    .map((h, i) => `[L${i + 1}] ${h.title}: ${h.snippet.slice(0, 500)}`)
    .join("\n");
  const doc = WORKING_SECTION_KEYS.map((k) => {
    const body = sections.find((s) => s.section_key === k)?.body?.trim();
    return `${WORKING_SECTION_LABELS[k]} [${k}]:\n${body || "(empty)"}`;
  }).join("\n\n");
  const truthBrief = truth.items
    .slice(0, 20)
    .map((t) => `[${t.id}] ${t.label}: ${t.text.slice(0, 450)}`)
    .join("\n");

  const result = await runAgent({
    agent: "coach",
    feature: "working_doc_idea_draft",
    tier: "strong",
    system: [
      sharedSystemPrefix(),
      "",
      `Task: ${opts.name} on this team has an idea for their Ethics Bowl working document. Do the work a good teammate would before bringing it to the team:`,
      "1. Research it: use the truth source and library passages below to find what backs it and what cuts against it. Do not invent facts or sources.",
      "2. Place it: rebuild the team's chain (supports so claim, claim so answer, objection and reply) and decide which step this idea supports, adds or repairs. Say so in fit.",
      "3. Test it: does it repeat what the document already says, conflict with another claim, or need a premise the team hasn't stated? Put what a judge would push on, and any evidence still missing, in risk.",
      "4. Draft it: write the text exactly as it should appear in that section, in the team's voice and matching the section's structure (Claim N:, Logic line:, S1., Backing:, Q:, A:). Improve the idea where the research shows how, but keep it recognizably theirs. If it replaces an existing sentence, copy that sentence exactly into replaces.",
      "Never name another team. Plain words. No em dashes.",
      `section_key must be one of: ${WORKING_SECTION_KEYS.join(", ")}.`,
      'Return JSON: {"section_key","fit","draft","replaces","risk","question_back","truth_source_id","verdict"} where verdict is strengthens, repeats or conflicts, and question_back is one question ending with What do you think?',
    ].join("\n"),
    user: [
      `Case ${truth.caseNumber ?? ""}: ${truth.caseTitle ?? ""}`,
      `Idea from ${opts.name}: ${opts.idea}`,
      "",
      "Working document:",
      doc,
      "",
      "Truth source:",
      truthBrief || "(empty)",
      "",
      "Library passages:",
      library || "(none found)",
    ].join("\n"),
    schema: draftSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.05,
  });
  if (!result.ok || result.stub) return null;
  const d = result.data;
  const cite = d.truth_source_id ? truth.items.find((t) => t.id === d.truth_source_id) ?? null : null;
  const lead =
    d.verdict === "repeats"
      ? `${opts.name}'s idea, researched by Cruxy (close to what you already have):`
      : d.verdict === "conflicts"
        ? `${opts.name}'s idea, researched by Cruxy (check it against your other claims):`
        : `${opts.name}'s idea, researched and drafted by Cruxy:`;
  const question = /what do you think\?/i.test(d.question_back)
    ? d.question_back
    : `${d.question_back.replace(/\?$/, "")}? What do you think?`;
  return {
    sectionKey: d.section_key,
    kind: KIND_FOR_SECTION[d.section_key],
    text: `${lead} ${d.draft} Where it fits: ${d.fit} Watch for: ${d.risk} ${question}`,
    weakSpot: d.replaces ? `"${d.replaces}": ${opts.name} suggests a stronger version.` : null,
    why: d.fit,
    stronger: d.draft,
    questionBack: question,
    citation: cite?.label ?? null,
  };
}
