/**
 * A comment or sticky note left while reading (a web reading, an imported
 * reading, or the case text itself) gets its own look from Cruxy:
 *
 * 1. Weigh it: does it carry ethical weight for this case? A value, a duty,
 *    a stakeholder, a harm, a distinction, an objection, a test case.
 *    Logistics, summaries without a stance and things the document already
 *    says stay as notes, with a one line reason the team can see.
 * 2. If it does, treat it as a starting point: work out what it is reaching
 *    for, research it, and draft a real suggestion for the working document,
 *    credited to the person who wrote the note.
 */
import "server-only";
import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { listCases, listPeopleFull, logActivity } from "@/lib/db/repository";
import {
  WORKING_SECTION_KEYS,
  WORKING_SECTION_LABELS,
  listWorkingSections,
  updateSuggestionDraft,
} from "@/lib/db/supabase/working-doc-extra";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { addWorkingDocSuggestion } from "@/lib/working-doc/suggestions";
import { nowIso } from "@/lib/utils";

export type NoteSourceKind = "annotation" | "case_comment";
export type NoteStatus = "thinking" | "drafted" | "kept" | "failed";

export type NoteSuggestionRow = {
  source_kind: NoteSourceKind;
  source_id: string;
  team_id: string;
  case_id: string;
  person_id: string | null;
  status: NoteStatus;
  reason: string | null;
  suggestion_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listNoteStatuses(opts: {
  teamId: string;
  caseId: string;
  sourceIds?: string[];
}): Promise<NoteSuggestionRow[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.reading_note_suggestions ?? []).filter(
      (r) =>
        r.team_id === opts.teamId &&
        r.case_id === opts.caseId &&
        (!opts.sourceIds || opts.sourceIds.includes(r.source_id)),
    );
  }
  let q = getServiceSupabase()
    .from("reading_note_suggestions")
    .select("*")
    .eq("team_id", opts.teamId)
    .eq("case_id", opts.caseId);
  if (opts.sourceIds?.length) q = q.in("source_id", opts.sourceIds);
  const { data, error } = await q;
  if (error) throw new Error(`listNoteStatuses: ${error.message}`);
  return (data ?? []) as NoteSuggestionRow[];
}

async function saveStatus(row: Omit<NoteSuggestionRow, "created_at" | "updated_at">) {
  const now = nowIso();
  if (isSampleDataMode()) {
    await updateStore((store) => {
      const rows = store.reading_note_suggestions ?? (store.reading_note_suggestions = []);
      const i = rows.findIndex((r) => r.source_kind === row.source_kind && r.source_id === row.source_id);
      if (i >= 0) rows[i] = { ...rows[i]!, ...row, updated_at: now };
      else rows.push({ ...row, created_at: now, updated_at: now });
    });
    return;
  }
  const { error } = await getServiceSupabase()
    .from("reading_note_suggestions")
    .upsert({ ...row, updated_at: now }, { onConflict: "source_kind,source_id" });
  if (error) throw new Error(`saveStatus: ${error.message}`);
}

const triageSchema = z.object({
  weight: z
    .preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(["strong", "some", "none"]))
    .catch("none"),
  thought: z.string().catch(""),
  reason: z.string().catch(""),
});

/** Cut the passage down to the part around the quoted words. */
function around(passage: string | null, quote: string | null, max = 1600): string | null {
  if (!passage) return null;
  const text = passage.replace(/\s+\n/g, "\n").trim();
  if (text.length <= max) return text;
  const at = quote ? text.indexOf(quote.slice(0, 60)) : -1;
  const start = Math.max(0, (at >= 0 ? at : 0) - Math.floor(max / 3));
  return `${start > 0 ? "..." : ""}${text.slice(start, start + max)}${start + max < text.length ? "..." : ""}`;
}

/**
 * Weigh one note and, if it carries ethical weight, research and draft it into
 * a suggestion. Safe to call twice: a note already drafted or kept is skipped
 * unless force is set ("Draft it anyway").
 */
export async function considerNote(opts: {
  sourceKind: NoteSourceKind;
  sourceId: string;
  teamId: string;
  caseId: string;
  personId: string;
  readingTitle: string;
  readingUrl?: string | null;
  quote: string | null;
  note: string;
  passage: string | null;
  force?: boolean;
}): Promise<NoteSuggestionRow["status"]> {
  const note = opts.note.trim();
  if (!note && !opts.quote) return "kept";
  const existing = (await listNoteStatuses({ teamId: opts.teamId, caseId: opts.caseId, sourceIds: [opts.sourceId] }))
    .find((r) => r.source_kind === opts.sourceKind);
  // Finished notes are not weighed twice unless the team asks ("Draft it anyway").
  if (existing && !opts.force && (existing.status === "drafted" || existing.status === "kept")) return existing.status;
  if (existing?.status === "drafted" && existing.suggestion_id) return "drafted";

  const base = {
    source_kind: opts.sourceKind,
    source_id: opts.sourceId,
    team_id: opts.teamId,
    case_id: opts.caseId,
    person_id: opts.personId,
  };
  await saveStatus({ ...base, status: "thinking", reason: null, suggestion_id: null });

  try {
    const [cases, people, brief] = await Promise.all([
      listCases(),
      listPeopleFull(),
      ensureTeamBrief({ teamId: opts.teamId, caseId: opts.caseId, personId: opts.personId }),
    ]);
    const c = cases.find((x) => x.id === opts.caseId);
    const name = people.find((p) => p.id === opts.personId)?.name?.split(" ")[0] ?? "A teammate";
    const sections = await listWorkingSections(brief.id).catch(() => []);
    const doc = WORKING_SECTION_KEYS.map((k) => {
      const body = sections.find((s) => s.section_key === k)?.body?.trim();
      return `${WORKING_SECTION_LABELS[k]}:\n${body ? body.slice(0, 900) : "(empty)"}`;
    }).join("\n\n");
    const passage = around(opts.passage, opts.quote);

    let thought = note;
    if (!opts.force) {
      const triage = await runAgent({
        agent: "coach",
        feature: "reading_note_triage",
        tier: "small",
        system: [
          sharedSystemPrefix(),
          "",
          `Task: ${name} left a note while reading for an Ethics Bowl case. Decide if it carries ethical weight for this case, so it is worth developing into the team's working document.`,
          "Ethical weight means it bears on what is right, wrong or owed in this case: a value, principle, right or duty; a stakeholder and what they stand to gain or lose; a harm, benefit or consequence; fairness, consent, trust, responsibility or blame; a moral distinction; an objection or counterexample to a moral claim; an analogy or thought experiment that tests a principle; or a fact that changes the moral picture.",
          "Notes are often rough: one word, a question, 'hmm', 'this!', a hunch. Judge the thought behind the note together with the passage it sits on, not the polish of the wording. A rough note on a morally loaded passage can be strong.",
          "No weight: logistics or reminders, vocabulary or definitions, a plain summary with no stance, praise or agreement with nothing added, a factual aside with no moral bearing, or a point the working document already makes in the same way.",
          "weight: strong, some or none.",
          "thought: the ethical thought the note is reaching for, as one clear sentence in plain words (empty when none).",
          "reason: one short sentence the team will see. When none, say why kindly (for example: Reads as a reminder, not a point about the case; or: Your Claims already make this point). When strong or some, say what it could add.",
          "Plain words. No em dashes.",
          'Return JSON: {"weight","thought","reason"}',
        ].join("\n"),
        user: [
          `Case ${c?.number ?? ""}: ${c?.title ?? ""}`,
          c?.crux ? `The crux: ${c.crux}` : "",
          `Reading: ${opts.readingTitle}`,
          passage ? `Passage:\n${passage}` : "",
          opts.quote ? `Words they marked: "${opts.quote.slice(0, 500)}"` : "",
          `Their note: ${note || "(no words, only the marked passage)"}`,
          "",
          "The team's working document now:",
          doc,
        ]
          .filter(Boolean)
          .join("\n"),
        schema: triageSchema,
        personId: opts.personId,
        estimatedCostUsd: 0.01,
        stubFallback: () => ({ weight: "none" as const, thought: "", reason: "Cruxy could not weigh this one just now." }),
      });
      const t = triage.ok && !triage.stub ? triage.data : null;
      if (!t) {
        await saveStatus({ ...base, status: "failed", reason: "Cruxy could not weigh this one just now.", suggestion_id: null });
        return "failed";
      }
      if (t.weight === "none") {
        await saveStatus({
          ...base,
          status: "kept",
          reason: (t.reason || "Kept as a note.").replace(/[·—–]/g, ",").slice(0, 240),
          suggestion_id: null,
        });
        await logActivity({
          person_id: opts.personId,
          action: "reading_note_kept",
          target: opts.sourceId,
          meta: { caseId: opts.caseId, sourceKind: opts.sourceKind },
        });
        return "kept";
      }
      thought = t.thought || note;
    }

    const { draftIdea } = await import("@/lib/working-doc/idea-draft");
    const draft = await draftIdea({
      caseId: opts.caseId,
      briefId: brief.id,
      teamId: opts.teamId,
      personId: opts.personId,
      name,
      idea: thought,
      fromNote: { readingTitle: opts.readingTitle, passage, note: note || `(marked) ${opts.quote ?? ""}`, thought },
    }).catch(() => null);
    if (!draft) {
      await saveStatus({
        ...base,
        status: "failed",
        reason: "Cruxy could not finish the research just now.",
        suggestion_id: null,
      });
      return "failed";
    }

    const said = (note || opts.quote || "").replace(/\s+/g, " ").trim().slice(0, 300);
    const row = await addWorkingDocSuggestion({
      caseId: opts.caseId,
      teamId: opts.teamId,
      personId: opts.personId,
      kind: draft.kind,
      text: `${name}'s note on "${opts.readingTitle.slice(0, 80)}", developed by Cruxy: "${said}"`,
      sectionKey: draft.sectionKey,
      source: "member",
    });
    const fromReading = {
      title: opts.readingTitle.slice(0, 200),
      url: opts.readingUrl && /^https?:\/\//.test(opts.readingUrl) ? opts.readingUrl : null,
      why: "Where the note came from",
    };
    await updateSuggestionDraft(row.id, {
      kind: draft.kind,
      section_key: draft.sectionKey,
      citation: opts.readingTitle.slice(0, 200),
      weak_spot: draft.weakSpot,
      why_weak: draft.why,
      stronger_version: draft.stronger,
      question_back: draft.questionBack,
      research_sources: [fromReading, ...draft.sources.filter((x) => x.title !== fromReading.title)].slice(0, 6),
    });
    await saveStatus({
      ...base,
      status: "drafted",
      reason: `Drafted for ${WORKING_SECTION_LABELS[draft.sectionKey] ?? "your working document"}.`,
      suggestion_id: row.id,
    });
    await logActivity({
      person_id: opts.personId,
      action: "reading_note_drafted",
      target: opts.sourceId,
      meta: { caseId: opts.caseId, sourceKind: opts.sourceKind, suggestionId: row.id, forced: Boolean(opts.force) },
    });
    return "drafted";
  } catch (e) {
    console.error("[reading-note] considerNote failed", e);
    await saveStatus({
      ...base,
      status: "failed",
      reason: e instanceof Error ? e.message.slice(0, 200) : "Something went wrong.",
      suggestion_id: null,
    }).catch(() => undefined);
    return "failed";
  }
}

/** Show "Cruxy is weighing this" right away, before the work starts after the response. */
export async function markNoteThinking(opts: {
  sourceKind: NoteSourceKind;
  sourceId: string;
  teamId: string;
  caseId: string;
  personId: string;
}) {
  await saveStatus({
    source_kind: opts.sourceKind,
    source_id: opts.sourceId,
    team_id: opts.teamId,
    case_id: opts.caseId,
    person_id: opts.personId,
    status: "thinking",
    reason: null,
    suggestion_id: null,
  });
}

export async function markNoteFailed(opts: {
  sourceKind: NoteSourceKind;
  sourceId: string;
  teamId: string;
  caseId: string;
  personId: string;
}) {
  await saveStatus({
    source_kind: opts.sourceKind,
    source_id: opts.sourceId,
    team_id: opts.teamId,
    case_id: opts.caseId,
    person_id: opts.personId,
    status: "failed",
    reason: "Cruxy could not finish this one.",
    suggestion_id: null,
  });
}
