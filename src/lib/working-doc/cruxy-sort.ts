/**
 * Cruxy sorts a team's own document: which case each part is about, and
 * which working-document section each paragraph belongs in. The team's words
 * are kept; Cruxy only decides where they go.
 */
import "server-only";
import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import {
  WORKING_SECTION_KEYS,
  WORKING_SECTION_LABELS,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";

type CaseLite = { id: string; number: number; title: string; active?: boolean };

const loose = <T extends z.ZodTypeAny>(t: T) => t.optional().nullable().catch(null);

/** Split a document with no case headings into per case pieces. */
export async function sortByCaseWithCruxy(opts: {
  body: string;
  cases: CaseLite[];
  personId: string;
}): Promise<{ caseId: string; caseNumber: number; title: string; body: string }[] | null> {
  const paras = opts.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length) return null;
  const active = opts.cases.filter((c) => c.active !== false);
  const numbered = paras.map((p, i) => `[${i}] ${p.slice(0, 260).replace(/\n/g, " ")}`).join("\n");

  const schema = z.object({
    paragraphs: z.array(z.object({ i: z.coerce.number(), case_number: loose(z.coerce.number()) }).passthrough()).catch([]),
  });
  const res = await runAgent({
    agent: "librarian",
    feature: "team_doc_sort_by_case",
    tier: "small",
    system: [
      sharedSystemPrefix(),
      "",
      "Task: a team uploaded their own Ethics Bowl notes. Say which case each numbered paragraph is about.",
      "Cases:",
      ...active.map((c) => `- ${c.number}: ${c.title}`),
      "Rules: a paragraph about the same topic as the one before it usually belongs to the same case. Use null only for a paragraph about no case at all (a table of contents, a team roster).",
      'Return JSON: {"paragraphs":[{"i":0,"case_number":3}, ...]} with one entry per paragraph.',
    ].join("\n"),
    user: numbered.slice(0, 60_000),
    schema,
    personId: opts.personId,
    estimatedCostUsd: 0.01,
    stubFallback: () => ({ paragraphs: [] }),
  }).catch(() => null);
  const tags = res?.data?.paragraphs ?? [];
  if (!tags.length) return null;

  const byCase = new Map<number, string[]>();
  let last: number | null = null;
  paras.forEach((p, i) => {
    const tag = tags.find((t) => t.i === i)?.case_number ?? null;
    const n = tag != null && active.some((c) => c.number === tag) ? tag : last;
    if (n == null) return;
    last = n;
    byCase.set(n, [...(byCase.get(n) ?? []), p]);
  });
  const out = [...byCase.entries()]
    .map(([n, ps]) => {
      const c = active.find((x) => x.number === n)!;
      return { caseId: c.id, caseNumber: n, title: c.title, body: ps.join("\n\n") };
    })
    .filter((x) => x.body.length > 40);
  return out.length ? out : null;
}

/** Sort one case's text into the six working-document sections. */
export async function mapSectionsWithCruxy(opts: {
  body: string;
  caseTitle: string;
  personId: string;
}): Promise<Record<WorkingSectionKey, string> | null> {
  const paras = opts.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 400);
  if (!paras.length) return null;
  const numbered = paras.map((p, i) => `[${i}] ${p.slice(0, 500).replace(/\n/g, " ")}`).join("\n");
  const schema = z.object({
    paragraphs: z
      .array(z.object({ i: z.coerce.number(), section: z.string().catch("") }).passthrough())
      .catch([]),
    answer: z.string().optional().nullable().catch(null),
  });
  const res = await runAgent({
    agent: "librarian",
    feature: "team_doc_sort_sections",
    tier: "small",
    system: [
      sharedSystemPrefix(),
      "",
      `Task: a team's notes on the case "${opts.caseTitle}". Put each numbered paragraph in the working-document section where it belongs.`,
      `Sections: ${WORKING_SECTION_KEYS.map((k) => `${k} (${WORKING_SECTION_LABELS[k]})`).join(", ")}.`,
      "Guide: the team's position or thesis goes in answer_one_sentence; their claims and the logic from claim to answer in claims; evidence, facts, examples, frameworks and backing in support; objections, counterarguments and replies in objection_reply; competing values, the crux and trade offs in values_in_tension; questions a judge or the other team could ask, with answers, in judges_questions.",
      "Every paragraph goes somewhere; pick the closest section rather than leaving one out. Do not rewrite anything.",
      "answer: if the team states its position, copy their one sentence answer word for word; otherwise null.",
      'Return JSON: {"paragraphs":[{"i":0,"section":"claims"}, ...],"answer":"..."}',
    ].join("\n"),
    user: numbered.slice(0, 60_000),
    schema,
    personId: opts.personId,
    estimatedCostUsd: 0.01,
    stubFallback: () => ({ paragraphs: [], answer: null }),
  }).catch(() => null);
  const tags = res?.data?.paragraphs ?? [];
  if (tags.length < Math.ceil(paras.length / 2)) return null;

  const out = Object.fromEntries(WORKING_SECTION_KEYS.map((k) => [k, [] as string[]])) as Record<
    WorkingSectionKey,
    string[]
  >;
  let last: WorkingSectionKey = "claims";
  paras.forEach((p, i) => {
    const raw = (tags.find((t) => t.i === i)?.section ?? "").trim().toLowerCase();
    const key = (WORKING_SECTION_KEYS as readonly string[]).includes(raw) ? (raw as WorkingSectionKey) : last;
    last = key;
    out[key].push(p);
  });
  const answer = res?.data?.answer?.trim();
  if (answer && opts.body.includes(answer.slice(0, 40)) && !out.answer_one_sentence.length) {
    out.answer_one_sentence.push(answer);
  }
  return Object.fromEntries(WORKING_SECTION_KEYS.map((k) => [k, out[k].join("\n\n")])) as Record<
    WorkingSectionKey,
    string
  >;
}
