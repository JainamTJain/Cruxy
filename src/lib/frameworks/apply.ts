/**
 * Cached "how this term applies to this case" lines from Cruxy.
 * No citation, no display of the apply line (static explanation still shows).
 */
import "server-only";

import { getFrameworkById } from "@/lib/frameworks/catalog";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import type { CitationSource } from "@/lib/cruxy/citations";
import { isSampleDataMode } from "@/lib/db/config";
import { listCases, logActivity } from "@/lib/db/repository";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";

export type FrameworkApplyRow = {
  term_id: string;
  case_id: string;
  apply_text: string;
  citation_ids: string[];
  source_url: string;
  created_at: string;
};

type StoreBag = {
  framework_case_applies?: FrameworkApplyRow[];
};

export async function getCachedApply(
  termId: string,
  caseId: string,
): Promise<FrameworkApplyRow | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (
      ((store as StoreBag).framework_case_applies ?? []).find(
        (r) => r.term_id === termId && r.case_id === caseId,
      ) ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("framework_case_applies")
    .select("term_id,case_id,apply_text,citation_ids,source_url,created_at")
    .eq("term_id", termId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) {
    // Table may not exist yet on a fresh preview.
    return null;
  }
  if (!data) return null;
  const ids = (data.citation_ids as string[] | null) ?? [];
  if (!ids.length) return null;
  return {
    term_id: String(data.term_id),
    case_id: String(data.case_id),
    apply_text: String(data.apply_text),
    citation_ids: ids,
    source_url: String(data.source_url),
    created_at: String(data.created_at),
  };
}

async function saveApply(row: FrameworkApplyRow): Promise<void> {
  if (!row.citation_ids.length) return;
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((s as StoreBag).framework_case_applies ??= []);
      const i = bag.findIndex(
        (r) => r.term_id === row.term_id && r.case_id === row.case_id,
      );
      if (i >= 0) bag[i] = row;
      else bag.push(row);
    });
    return;
  }
  const { error } = await getServiceSupabase()
    .from("framework_case_applies")
    .upsert(
      {
        term_id: row.term_id,
        case_id: row.case_id,
        apply_text: row.apply_text,
        citation_ids: row.citation_ids,
        source_url: row.source_url,
        created_at: row.created_at,
      },
      { onConflict: "term_id,case_id" },
    );
  assertOk(error, "framework_case_applies upsert");
}

async function caseContext(caseId: string): Promise<{
  title: string;
  number: number;
  facts: string;
  sources: CitationSource[];
} | null> {
  const cases = await listCases().catch(() => []);
  const c = cases.find((x) => x.id === caseId) ?? null;
  if (!c) return null;
  const parts = [
    c.title,
    c.crux,
    c.trap,
    c.closing_question,
  ].filter(Boolean) as string[];
  const facts = parts.join("\n").slice(0, 3500);
  const sources: CitationSource[] = [
    {
      id: `case:${c.id}`,
      text: facts || `Case ${c.number}: ${c.title}`,
      kind: "other",
    },
  ];
  return {
    title: c.title,
    number: c.number,
    facts: facts || `Case ${c.number}: ${c.title}`,
    sources,
  };
}

/**
 * Return cached apply line, or ask Cruxy once and cache if cited.
 */
export async function getOrCreateFrameworkApply(opts: {
  termId: string;
  caseId: string;
  personId: string;
}): Promise<{
  entryId: string;
  term: string;
  explanation: string;
  sourceUrl: string;
  sourceLabel: "SEP" | "IEP";
  apply: string | null;
  citationIds: string[];
  invented: false;
}> {
  const entry = getFrameworkById(opts.termId);
  if (!entry) {
    throw new Error("Unknown term.");
  }

  const cached = await getCachedApply(opts.termId, opts.caseId);
  if (cached) {
    return {
      entryId: entry.id,
      term: entry.term,
      explanation: entry.explanation,
      sourceUrl: entry.sourceUrl,
      sourceLabel: entry.sourceLabel,
      apply: cached.apply_text,
      citationIds: cached.citation_ids,
      invented: false,
    };
  }

  const ctx = await caseContext(opts.caseId);
  if (!ctx) {
    return {
      entryId: entry.id,
      term: entry.term,
      explanation: entry.explanation,
      sourceUrl: entry.sourceUrl,
      sourceLabel: entry.sourceLabel,
      apply: null,
      citationIds: [],
      invented: false,
    };
  }

  const encyclopedia: CitationSource = {
    id: `enc:${entry.id}`,
    text: `${entry.term}. ${entry.explanation} Source: ${entry.sourceUrl}`,
    kind: "other",
  };
  const corpus = [...ctx.sources, encyclopedia];

  const result = await callCruxy({
    feature: "framework_case_apply",
    tier: "small",
    personId: opts.personId,
    estimatedCostUsd: 0.015,
    citationCorpus: corpus,
    messages: [
      {
        role: "system",
        content: [
          "You help USC Ethics Bowl teammates understand frameworks in a case.",
          "Return JSON only: {\"claims\":[{\"text\":\"...\",\"citation_ids\":[\"...\"]}]}",
          "Write one or two short plain sentences on how THIS framework applies to THIS case.",
          "Use only the provided sources. Cite case:… and/or enc:… ids. No invented facts.",
          "No em dashes. Never say AI or a model name. If you cannot cite, return {\"claims\":[]}.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Framework: ${entry.term}`,
          `Plain meaning: ${entry.explanation}`,
          `Case ${ctx.number}: ${ctx.title}`,
          `Case text:`,
          ctx.facts,
          `Sources you may cite: ${corpus.map((s) => s.id).join(", ")}`,
        ].join("\n"),
      },
    ],
  });

  if (!result.ok || result.stub) {
    // Sample / no key: offer a clearly non-invented stub that still cites the encyclopedia.
    if (isSampleDataMode() && !process.env.AI_GATEWAY_API_KEY) {
      const apply =
        `On Case ${ctx.number}, use ${entry.term} to name the duty or good at stake and what it would forbid or require. Cite the case facts before you trade them away.`;
      const row: FrameworkApplyRow = {
        term_id: entry.id,
        case_id: opts.caseId,
        apply_text: apply,
        citation_ids: [encyclopedia.id, ctx.sources[0]!.id],
        source_url: entry.sourceUrl,
        created_at: nowIso(),
      };
      await saveApply(row);
      return {
        entryId: entry.id,
        term: entry.term,
        explanation: entry.explanation,
        sourceUrl: entry.sourceUrl,
        sourceLabel: entry.sourceLabel,
        apply: row.apply_text,
        citationIds: row.citation_ids,
        invented: false,
      };
    }
    return {
      entryId: entry.id,
      term: entry.term,
      explanation: entry.explanation,
      sourceUrl: entry.sourceUrl,
      sourceLabel: entry.sourceLabel,
      apply: null,
      citationIds: [],
      invented: false,
    };
  }

  let applyText: string | null = null;
  let citationIds: string[] = [];
  try {
    const m = result.text.match(/\{[\s\S]*\}/);
    const parsed = m ? (JSON.parse(m[0]) as { claims?: { text?: string; citation_ids?: string[] }[] }) : null;
    const claim = parsed?.claims?.find(
      (c) => (c.citation_ids?.length ?? 0) > 0 && (c.text ?? "").trim(),
    );
    if (claim) {
      applyText = String(claim.text).replace(/\s+/g, " ").trim().slice(0, 420);
      citationIds = (claim.citation_ids ?? []).filter(Boolean);
    }
  } catch {
    applyText = null;
  }

  if (!applyText || !citationIds.length) {
    return {
      entryId: entry.id,
      term: entry.term,
      explanation: entry.explanation,
      sourceUrl: entry.sourceUrl,
      sourceLabel: entry.sourceLabel,
      apply: null,
      citationIds: [],
      invented: false,
    };
  }

  const row: FrameworkApplyRow = {
    term_id: entry.id,
    case_id: opts.caseId,
    apply_text: applyText,
    citation_ids: citationIds,
    source_url: entry.sourceUrl,
    created_at: nowIso(),
  };
  await saveApply(row);
  await logActivity({
    person_id: opts.personId,
    action: "framework_case_apply_cached",
    target: opts.caseId,
    meta: { term_id: entry.id },
  });

  return {
    entryId: entry.id,
    term: entry.term,
    explanation: entry.explanation,
    sourceUrl: entry.sourceUrl,
    sourceLabel: entry.sourceLabel,
    apply: row.apply_text,
    citationIds: row.citation_ids,
    invented: false,
  };
}
