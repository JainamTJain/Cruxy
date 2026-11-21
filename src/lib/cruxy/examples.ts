
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import {
  insertCruxyFeedback,
  insertWorkedExample,
  listCruxyFeedback,
  listWorkedExamples,
  type CruxyFeedbackRow,
  type WorkedExampleRow,
} from "@/lib/db/supabase/cruxy-extra";
import type { CruxyAgentName } from "@/lib/cruxy/prompts/shared";

/** In-memory sample store for local / test:cruxy without Supabase. */
const sampleExamples: WorkedExampleRow[] = [];
const sampleFeedback: CruxyFeedbackRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function saveWorkedExample(input: {
  kind: "strong" | "weak";
  agent: CruxyAgentName | string;
  caseId?: string | null;
  teamId?: string | null;
  title: string;
  body: string;
  whatWentWrong?: string | null;
  citationIds?: string[];
  sourceRef?: string | null;
  personId?: string | null;
  approved?: boolean;
}): Promise<WorkedExampleRow> {
  const row: WorkedExampleRow = {
    id: randomUUID(),
    kind: input.kind,
    agent: input.agent,
    case_id: input.caseId ?? null,
    team_id: input.teamId ?? null,
    title: input.title,
    body: input.body,
    what_went_wrong: input.whatWentWrong ?? null,
    citation_ids: input.citationIds ?? [],
    embedding: null,
    source_ref: input.sourceRef ?? null,
    created_at: nowIso(),
    created_by: input.personId ?? null,
    approved: input.approved ?? false,
    approved_at: input.approved ? nowIso() : null,
    approved_by: input.approved ? (input.personId ?? null) : null,
  };

  if (isSampleDataMode()) {
    sampleExamples.unshift(row);
  } else {
    await insertWorkedExample(row);
  }

  await logActivity({
    person_id: input.personId ?? null,
    action: "worked_example_saved",
    target: row.id,
    meta: { kind: row.kind, agent: row.agent, case_id: row.case_id },
  });

  return row;
}

export async function listSimilarExamples(input: {
  agent: CruxyAgentName | string;
  caseId?: string | null;
  query?: string;
  limit?: number;
}): Promise<WorkedExampleRow[]> {
  const limit = input.limit ?? 3;
  const rows = isSampleDataMode()
    ? sampleExamples.filter(
        (e) =>
          (e.approved || e.kind === "strong") &&
          (!input.caseId || e.case_id === input.caseId || e.case_id == null) &&
          (e.agent === input.agent || e.agent === "shared"),
      )
    : await listWorkedExamples({
        caseId: input.caseId,
        agent: input.agent,
        approvedOnly: true,
        limit: 40,
      });

  const q = (input.query ?? "").toLowerCase();
  if (!q) return rows.slice(0, limit);

  return rows
    .map((e) => {
      const hay = `${e.title} ${e.body}`.toLowerCase();
      const score = q
        .split(/\W+/)
        .filter((w) => w.length > 3)
        .reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { e, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

export async function recordCruxyFeedback(input: {
  personId: string;
  agent: CruxyAgentName | string;
  feature: string;
  verdict: "useful" | "not_useful" | "wrong";
  reason?: string | null;
  outputRef?: string | null;
  caseId?: string | null;
}): Promise<CruxyFeedbackRow> {
  // "wrong" is for leads and admins; callers should enforce role.
  const row: CruxyFeedbackRow = {
    id: randomUUID(),
    person_id: input.personId,
    agent: input.agent,
    feature: input.feature,
    output_ref: input.outputRef ?? null,
    case_id: input.caseId ?? null,
    verdict: input.verdict,
    reason: input.reason ?? null,
    created_at: nowIso(),
    created_by: input.personId,
  };

  if (isSampleDataMode()) {
    sampleFeedback.unshift(row);
  } else {
    await insertCruxyFeedback(row);
  }

  await logActivity({
    person_id: input.personId,
    action: "cruxy_feedback",
    target: row.id,
    meta: {
      agent: row.agent,
      feature: row.feature,
      verdict: row.verdict,
      has_reason: Boolean(row.reason),
    },
  });

  return row;
}

export async function recentCruxyFeedback(opts?: {
  sinceDays?: number;
  limit?: number;
}): Promise<CruxyFeedbackRow[]> {
  const sinceDays = opts?.sinceDays ?? 7;
  const since = new Date(
    Date.now() - sinceDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (isSampleDataMode()) {
    return sampleFeedback
      .filter((f) => f.created_at >= since)
      .slice(0, opts?.limit ?? 100);
  }
  return listCruxyFeedback({ since, limit: opts?.limit ?? 100 });
}

/** Test helper: seed a few examples into sample memory. */
export function __seedSampleExamplesForTests(
  rows: Array<Partial<WorkedExampleRow> & { title: string; body: string }>,
): void {
  for (const r of rows) {
    sampleExamples.unshift({
      id: r.id ?? randomUUID(),
      kind: r.kind ?? "strong",
      agent: r.agent ?? "analyst",
      case_id: r.case_id ?? null,
      team_id: r.team_id ?? null,
      title: r.title,
      body: r.body,
      what_went_wrong: r.what_went_wrong ?? null,
      citation_ids: r.citation_ids ?? [],
      embedding: null,
      source_ref: r.source_ref ?? null,
      created_at: nowIso(),
      created_by: null,
      approved: r.approved ?? true,
      approved_at: nowIso(),
      approved_by: null,
    });
  }
}

export function __clearSampleCruxyStoreForTests(): void {
  sampleExamples.length = 0;
  sampleFeedback.length = 0;
}
