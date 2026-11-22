/**
 * Wave 9 C: Working document persistence (*-extra for shared boundary).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export const WORKING_SECTION_KEYS = [
  "answer_one_sentence",
  "claims",
  "support",
  "objection_reply",
  "values_in_tension",
  "judges_questions",
] as const;

export type WorkingSectionKey = (typeof WORKING_SECTION_KEYS)[number];

export const WORKING_SECTION_LABELS: Record<WorkingSectionKey, string> = {
  answer_one_sentence: "Our answer in one sentence",
  claims: "Claims",
  support: "Support for each claim",
  objection_reply: "The strongest objection and our reply",
  values_in_tension: "Values in tension",
  judges_questions: "Questions judges may ask",
};

export type WorkingPath = "imported" | "crux" | null;

export type WorkingSectionRow = {
  id: string;
  brief_id: string;
  section_key: WorkingSectionKey;
  body: string;
  updated_at: string;
  updated_by: string | null;
};

export type WorkingSocraticRow = {
  id: string;
  brief_id: string;
  section_key: WorkingSectionKey;
  question: string;
  answer: string | null;
  status: "open" | "answered" | "skipped";
  created_at: string;
  created_by: string | null;
  answered_at: string | null;
  answered_by: string | null;
};

export type WorkingSuggestionRow = {
  id: string;
  case_id: string;
  team_id: string;
  brief_id: string | null;
  kind: "evidence" | "gap" | "counter" | "sharper" | "question";
  text: string;
  citation: string | null;
  paragraph_anchor: string | null;
  section_key: WorkingSectionKey | null;
  source: "cruxy" | "evidence_library" | "member";
  truth_item_id: string | null;
  status: "pending" | "ticked" | "crossed";
  reject_reason: string | null;
  created_at: string;
  created_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
};

export type EvidenceTeamDecisionRow = {
  id: string;
  team_id: string;
  case_id: string;
  truth_item_id: string;
  decision: "tick" | "cross";
  reason: string | null;
  decided_at: string;
  decided_by: string | null;
};

const sampleSections: WorkingSectionRow[] = [];
const sampleSocratic: WorkingSocraticRow[] = [];
const sampleSuggestions: WorkingSuggestionRow[] = [];
const sampleEvidenceDecisions: EvidenceTeamDecisionRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function listWorkingSections(
  briefId: string,
): Promise<WorkingSectionRow[]> {
  if (isSampleDataMode()) {
    return sampleSections
      .filter((s) => s.brief_id === briefId)
      .sort(
        (a, b) =>
          WORKING_SECTION_KEYS.indexOf(a.section_key) -
          WORKING_SECTION_KEYS.indexOf(b.section_key),
      );
  }
  const { data, error } = await getServiceSupabase()
    .from("working_doc_sections")
    .select("*")
    .eq("brief_id", briefId);
  if (error) throw new Error(`listWorkingSections: ${error.message}`);
  return ((data ?? []) as WorkingSectionRow[]).sort(
    (a, b) =>
      WORKING_SECTION_KEYS.indexOf(a.section_key) -
      WORKING_SECTION_KEYS.indexOf(b.section_key),
  );
}

export async function ensureWorkingSections(
  briefId: string,
  personId: string | null,
): Promise<WorkingSectionRow[]> {
  const existing = await listWorkingSections(briefId);
  const have = new Set(existing.map((s) => s.section_key));
  const missing = WORKING_SECTION_KEYS.filter((k) => !have.has(k));
  if (missing.length === 0) return existing;

  const at = nowIso();
  const rows: WorkingSectionRow[] = missing.map((section_key) => ({
    id: randomUUID(),
    brief_id: briefId,
    section_key,
    body: "",
    updated_at: at,
    updated_by: personId,
  }));

  if (isSampleDataMode()) {
    sampleSections.push(...rows);
    return listWorkingSections(briefId);
  }

  const { error } = await getServiceSupabase()
    .from("working_doc_sections")
    .insert(rows);
  if (error) throw new Error(`ensureWorkingSections: ${error.message}`);
  return listWorkingSections(briefId);
}

export async function updateWorkingSection(input: {
  briefId: string;
  sectionKey: WorkingSectionKey;
  body: string;
  personId: string;
}): Promise<WorkingSectionRow> {
  const body = input.body.replace(/[·—–]/g, ",");
  if (isSampleDataMode()) {
    const i = sampleSections.findIndex(
      (s) =>
        s.brief_id === input.briefId && s.section_key === input.sectionKey,
    );
    if (i < 0) {
      const row: WorkingSectionRow = {
        id: randomUUID(),
        brief_id: input.briefId,
        section_key: input.sectionKey,
        body,
        updated_at: nowIso(),
        updated_by: input.personId,
      };
      sampleSections.push(row);
      return row;
    }
    sampleSections[i] = {
      ...sampleSections[i]!,
      body,
      updated_at: nowIso(),
      updated_by: input.personId,
    };
    return sampleSections[i]!;
  }

  const { data, error } = await getServiceSupabase()
    .from("working_doc_sections")
    .upsert(
      {
        brief_id: input.briefId,
        section_key: input.sectionKey,
        body,
        updated_at: nowIso(),
        updated_by: input.personId,
      },
      { onConflict: "brief_id,section_key" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`updateWorkingSection: ${error.message}`);
  return data as WorkingSectionRow;
}

export async function getOpenSocratic(
  briefId: string,
  sectionKey: WorkingSectionKey,
): Promise<WorkingSocraticRow | null> {
  if (isSampleDataMode()) {
    return (
      sampleSocratic
        .filter(
          (s) =>
            s.brief_id === briefId &&
            s.section_key === sectionKey &&
            s.status === "open",
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("working_doc_socratic")
    .select("*")
    .eq("brief_id", briefId)
    .eq("section_key", sectionKey)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOpenSocratic: ${error.message}`);
  return (data as WorkingSocraticRow | null) ?? null;
}

export async function insertSocratic(input: {
  briefId: string;
  sectionKey: WorkingSectionKey;
  question: string;
  personId: string | null;
}): Promise<WorkingSocraticRow> {
  const row: WorkingSocraticRow = {
    id: randomUUID(),
    brief_id: input.briefId,
    section_key: input.sectionKey,
    question: input.question.replace(/[·—–]/g, ","),
    answer: null,
    status: "open",
    created_at: nowIso(),
    created_by: input.personId,
    answered_at: null,
    answered_by: null,
  };
  if (isSampleDataMode()) {
    sampleSocratic.push(row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("working_doc_socratic")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`insertSocratic: ${error.message}`);
  return data as WorkingSocraticRow;
}

export async function answerSocratic(input: {
  id: string;
  answer: string;
  personId: string;
}): Promise<WorkingSocraticRow | null> {
  const answer = input.answer.trim().replace(/[·—–]/g, ",");
  if (isSampleDataMode()) {
    const i = sampleSocratic.findIndex((s) => s.id === input.id);
    if (i < 0) return null;
    sampleSocratic[i] = {
      ...sampleSocratic[i]!,
      answer,
      status: "answered",
      answered_at: nowIso(),
      answered_by: input.personId,
    };
    return sampleSocratic[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("working_doc_socratic")
    .update({
      answer,
      status: "answered",
      answered_at: nowIso(),
      answered_by: input.personId,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`answerSocratic: ${error.message}`);
  return (data as WorkingSocraticRow | null) ?? null;
}

export async function listPendingSuggestions(input: {
  teamId: string;
  caseId: string;
}): Promise<WorkingSuggestionRow[]> {
  if (isSampleDataMode()) {
    return sampleSuggestions.filter(
      (s) =>
        s.team_id === input.teamId &&
        s.case_id === input.caseId &&
        s.status === "pending",
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("working_doc_suggestions")
    .select("*")
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingSuggestions: ${error.message}`);
  return (data ?? []) as WorkingSuggestionRow[];
}

export async function listAllSuggestions(input: {
  teamId: string;
  caseId: string;
}): Promise<WorkingSuggestionRow[]> {
  if (isSampleDataMode()) {
    return sampleSuggestions.filter(
      (s) => s.team_id === input.teamId && s.case_id === input.caseId,
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("working_doc_suggestions")
    .select("*")
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAllSuggestions: ${error.message}`);
  return (data ?? []) as WorkingSuggestionRow[];
}

export async function insertSuggestion(
  input: Omit<
    WorkingSuggestionRow,
    "id" | "created_at" | "status" | "reject_reason" | "decided_at" | "decided_by"
  > & { status?: WorkingSuggestionRow["status"] },
): Promise<WorkingSuggestionRow> {
  const row: WorkingSuggestionRow = {
    id: randomUUID(),
    case_id: input.case_id,
    team_id: input.team_id,
    brief_id: input.brief_id,
    kind: input.kind,
    text: input.text.replace(/[·—–]/g, ","),
    citation: input.citation,
    paragraph_anchor: input.paragraph_anchor,
    section_key: input.section_key,
    source: input.source,
    truth_item_id: input.truth_item_id,
    status: input.status ?? "pending",
    reject_reason: null,
    created_at: nowIso(),
    created_by: input.created_by,
    decided_at: null,
    decided_by: null,
  };
  if (isSampleDataMode()) {
    const dup = sampleSuggestions.find(
      (s) =>
        s.team_id === row.team_id &&
        s.case_id === row.case_id &&
        s.text === row.text &&
        s.status === "pending",
    );
    if (dup) return dup;
    sampleSuggestions.push(row);
    return row;
  }
  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("working_doc_suggestions")
    .select("*")
    .eq("team_id", row.team_id)
    .eq("case_id", row.case_id)
    .eq("text", row.text)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return existing as WorkingSuggestionRow;

  const { data, error } = await sb
    .from("working_doc_suggestions")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`insertSuggestion: ${error.message}`);
  return data as WorkingSuggestionRow;
}

export async function decideSuggestion(input: {
  id: string;
  status: "ticked" | "crossed";
  reason?: string | null;
  personId: string;
}): Promise<WorkingSuggestionRow | null> {
  const reason = input.reason?.trim().replace(/[·—–]/g, ",").slice(0, 40) || null;
  if (isSampleDataMode()) {
    const i = sampleSuggestions.findIndex((s) => s.id === input.id);
    if (i < 0) return null;
    sampleSuggestions[i] = {
      ...sampleSuggestions[i]!,
      status: input.status,
      reject_reason: input.status === "crossed" ? reason : null,
      decided_at: nowIso(),
      decided_by: input.personId,
    };
    return sampleSuggestions[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("working_doc_suggestions")
    .update({
      status: input.status,
      reject_reason: input.status === "crossed" ? reason : null,
      decided_at: nowIso(),
      decided_by: input.personId,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`decideSuggestion: ${error.message}`);
  return (data as WorkingSuggestionRow | null) ?? null;
}

export async function listEvidenceDecisions(input: {
  teamId: string;
  caseId: string;
}): Promise<EvidenceTeamDecisionRow[]> {
  if (isSampleDataMode()) {
    return sampleEvidenceDecisions.filter(
      (d) => d.team_id === input.teamId && d.case_id === input.caseId,
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("evidence_team_decisions")
    .select("*")
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId);
  if (error) throw new Error(`listEvidenceDecisions: ${error.message}`);
  return (data ?? []) as EvidenceTeamDecisionRow[];
}

export async function upsertEvidenceDecision(input: {
  teamId: string;
  caseId: string;
  truthItemId: string;
  decision: "tick" | "cross";
  reason?: string | null;
  personId: string;
}): Promise<EvidenceTeamDecisionRow> {
  const reason =
    input.reason?.trim().replace(/[·—–]/g, ",").slice(0, 40) || null;
  if (isSampleDataMode()) {
    const i = sampleEvidenceDecisions.findIndex(
      (d) =>
        d.team_id === input.teamId && d.truth_item_id === input.truthItemId,
    );
    const row: EvidenceTeamDecisionRow = {
      id: i >= 0 ? sampleEvidenceDecisions[i]!.id : randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      truth_item_id: input.truthItemId,
      decision: input.decision,
      reason: input.decision === "cross" ? reason : null,
      decided_at: nowIso(),
      decided_by: input.personId,
    };
    if (i >= 0) sampleEvidenceDecisions[i] = row;
    else sampleEvidenceDecisions.push(row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("evidence_team_decisions")
    .upsert(
      {
        team_id: input.teamId,
        case_id: input.caseId,
        truth_item_id: input.truthItemId,
        decision: input.decision,
        reason: input.decision === "cross" ? reason : null,
        decided_at: nowIso(),
        decided_by: input.personId,
      },
      { onConflict: "team_id,truth_item_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertEvidenceDecision: ${error.message}`);
  return data as EvidenceTeamDecisionRow;
}

export async function insertSharedEvidenceFact(input: {
  caseId: string;
  teamId: string;
  text: string;
  citation: string;
  personId: string;
  kind?: "fact" | "quote" | "example" | "framework";
}): Promise<{ id: string; text: string; citation: string }> {
  const text = input.text.trim().replace(/[·—–]/g, ",");
  const citation = input.citation.trim().replace(/[·—–]/g, ",");
  if (!text || !citation) {
    throw new Error("A fact needs both the text and a citation.");
  }

  if (isSampleDataMode()) {
    const { readStore, writeStore } = await import("@/lib/db/sample-store");
    const store = await readStore();
    const id = randomUUID();
    const at = nowIso();
    store.truth_items.push({
      id,
      team_id: input.teamId,
      case_id: input.caseId,
      kind: input.kind ?? "fact",
      text: `${text} (${citation})`,
      citation_ids: [],
      status: "accepted",
      created_at: at,
      created_by: input.personId,
      updated_at: at,
    });
    await writeStore(store);
    return { id, text, citation };
  }

  const { data, error } = await getServiceSupabase()
    .from("truth_items")
    .insert({
      team_id: input.teamId,
      case_id: input.caseId,
      kind: input.kind ?? "fact",
      text: `${text} (${citation})`,
      citation_ids: [],
      status: "accepted",
      created_by: input.personId,
    })
    .select("id, text")
    .single();
  if (error) throw new Error(`insertSharedEvidenceFact: ${error.message}`);
  return { id: String(data.id), text, citation };
}
