/**
 * Take: write an accepted suggestion into the working document.
 *
 * Cruxy makes the smallest edit that takes the suggestion in (replace the
 * quoted sentence, insert a bridging premise after the step it bridges, or add
 * the missing piece), keeps every other line as the team wrote it, and stores
 * the old section text so the team can undo.
 */
import "server-only";

import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import {
  listWorkingSections,
  markSuggestionApplied,
  updateWorkingSection,
  WORKING_SECTION_LABELS,
  type WorkingSectionKey,
  type WorkingSuggestionRow,
} from "@/lib/db/supabase/working-doc-extra";

const SECTION_FOR_KIND: Partial<Record<WorkingSuggestionRow["kind"], WorkingSectionKey>> = {
  missing_link: "claims",
  disconnected_claim: "claims",
  logical_fallacy: "claims",
  evidence_gap: "support",
  evidence: "support",
  unanswered_counter: "objection_reply",
  counter: "objection_reply",
  missing_perspective: "values_in_tension",
  missing_stakeholder: "values_in_tension",
  loose_end: "judges_questions",
  question: "judges_questions",
  sharper_wording: "answer_one_sentence",
  sharper: "claims",
  gap: "support",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** The sentence a suggestion quotes, from its weak spot ("…": why). */
export function quotedText(s: Pick<WorkingSuggestionRow, "weak_spot">): string | null {
  const m = s.weak_spot?.match(/^"([^"]{8,})"/);
  return m?.[1]?.trim() ?? null;
}

/** Text the team should end up with, for suggestions without a stronger version. */
function proposedText(s: WorkingSuggestionRow): string {
  if (s.stronger_version?.trim()) return s.stronger_version.trim();
  return s.text
    .replace(/^[A-Z][a-z]+'s idea(, drafted by Cruxy)?:\s*/, "")
    .replace(/^Where it is weak:[\s\S]*?Stronger:\s*/i, "")
    .replace(/\s*(What do you think\?)\s*$/i, "")
    .trim();
}

/** Plain fallback: swap the quoted sentence, else add the text on its own line. */
function deterministicEdit(body: string, quote: string | null, text: string): string {
  if (quote) {
    const i = body.indexOf(quote);
    if (i >= 0) return body.slice(0, i) + text + body.slice(i + quote.length);
    // Loose match on a line that carries the quote's words.
    const lines = body.split("\n");
    const q = norm(quote).slice(0, 40);
    const at = lines.findIndex((l) => norm(l).includes(q));
    if (at >= 0) {
      lines.splice(at + 1, 0, text);
      return lines.join("\n");
    }
  }
  return body.trim() ? `${body.trimEnd()}\n${text}` : text;
}

/** Keep an edit only if it leaves the team's other lines in place. */
function keepsTheRest(before: string, after: string, quote: string | null): boolean {
  if (!after.trim()) return false;
  const q = quote ? norm(quote) : "";
  const lines = before
    .split("\n")
    .map((l) => norm(l))
    .filter((l) => l.length > 12 && !(q && (l.includes(q.slice(0, 30)) || q.includes(l.slice(0, 30)))));
  if (!lines.length) return true;
  const a = norm(after);
  const kept = lines.filter((l) => a.includes(l.slice(0, 40))).length;
  return kept / lines.length >= 0.8;
}

const editSchema = z.object({ body: z.string().min(1).max(12000) });

export async function applySuggestionToDocument(opts: {
  briefId: string;
  personId: string;
  suggestion: WorkingSuggestionRow;
}): Promise<{ applied: boolean; sectionKey: WorkingSectionKey | null; via: "cruxy" | "plain" | null }> {
  const s = opts.suggestion;
  const sectionKey = s.section_key ?? SECTION_FOR_KIND[s.kind] ?? null;
  if (!sectionKey) return { applied: false, sectionKey: null, via: null };
  const text = proposedText(s);
  if (text.length < 8) return { applied: false, sectionKey, via: null };

  const sections = await listWorkingSections(opts.briefId);
  const before = sections.find((r) => r.section_key === sectionKey)?.body ?? "";
  const quote = quotedText(s);

  let after: string | null = null;
  let via: "cruxy" | "plain" = "plain";
  const result = await runAgent({
    agent: "coach",
    feature: "working_doc_take",
    tier: "strong",
    system: [
      sharedSystemPrefix(),
      "",
      "Task: the team accepted one suggestion for a section of its Ethics Bowl working document. Write it into the section.",
      "Make the smallest edit that fully takes the suggestion in:",
      "- If it quotes a sentence, replace that sentence with the improved text.",
      "- If it is a missing link in the reasoning, insert the bridging premise as its own line right after the step it bridges.",
      "- If it adds something missing (a stakeholder, a reply, a fact with its source), add it where it belongs in the section's structure.",
      "- If the suggestion is advice rather than finished text, write the finished text it asks for, in the team's voice.",
      "Keep every other line exactly as written, including labels such as Claim 1:, Logic line:, S1., Backing:, Objection 1:, Concede:, Q: and A:.",
      "Plain words. No em dashes. Never invent facts that are not in the suggestion or the section.",
      'Return JSON: {"body": "<the full section after the edit>"}',
    ].join("\n"),
    user: [
      `Section: ${WORKING_SECTION_LABELS[sectionKey]}`,
      "Current text:",
      before.trim() || "(empty)",
      "",
      "Accepted suggestion:",
      quote ? `Quoted sentence: "${quote}"` : null,
      s.weak_spot ? `Problem: ${s.weak_spot}` : null,
      s.logic_chain ? `Chain: ${s.logic_chain}` : null,
      `Text to take in: ${text}`,
    ]
      .filter(Boolean)
      .join("\n"),
    schema: editSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.02,
    stubFallback: () => ({ body: deterministicEdit(before, quote, text) }),
  });
  if (result.ok && !result.stub && keepsTheRest(before, result.data.body, quote)) {
    after = result.data.body.trim();
    via = "cruxy";
  }
  if (!after) {
    // Without Cruxy, only paste text that is finished writing, never advice.
    if (/^(narrow|add|replace|write|pick|name|say|use|separate|explain|back it|cite|state|make|give|list|turn|split|define|answer|draft)\b/i.test(text)) {
      return { applied: false, sectionKey, via: null };
    }
    after = deterministicEdit(before, quote, text);
  }
  if (norm(after) === norm(before)) return { applied: false, sectionKey, via: null };

  await updateWorkingSection({
    briefId: opts.briefId,
    sectionKey,
    body: after,
    personId: opts.personId,
  });
  await markSuggestionApplied({ id: s.id, prevBody: before, sectionKey });
  return { applied: true, sectionKey, via };
}
