/**
 * Workstream I: working-document highlights and comments (*-extra).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type WorkingAnnotationKind = "highlight" | "comment";
export type WorkingAnnotationTarget = "passage" | "section";

export type WorkingAnnotationRow = {
  id: string;
  case_id: string;
  team_id: string;
  target_kind: WorkingAnnotationTarget;
  target_id: string;
  kind: WorkingAnnotationKind;
  range: string;
  body: string | null;
  person_id: string;
  created_at: string;
  created_by: string | null;
};

type Row = Record<string, unknown>;

function nowIso() {
  return new Date().toISOString();
}

function mapRow(r: Row): WorkingAnnotationRow {
  return {
    id: r.id as string,
    case_id: r.case_id as string,
    team_id: r.team_id as string,
    target_kind: r.target_kind as WorkingAnnotationTarget,
    target_id: r.target_id as string,
    kind: r.kind as WorkingAnnotationKind,
    range: r.range as string,
    body: (r.body as string | null) ?? null,
    person_id: r.person_id as string,
    created_at: r.created_at as string,
    created_by: (r.created_by as string | null) ?? null,
  };
}

const sample: WorkingAnnotationRow[] = [];

export async function listWorkingAnnotations(input: {
  caseId: string;
  teamId: string;
}): Promise<WorkingAnnotationRow[]> {
  if (isSampleDataMode()) {
    return sample
      .filter(
        (a) => a.case_id === input.caseId && a.team_id === input.teamId,
      )
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const { data, error } = await getServiceSupabase()
    .from("working_annotations")
    .select("*")
    .eq("case_id", input.caseId)
    .eq("team_id", input.teamId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listWorkingAnnotations: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as Row));
}

export async function createWorkingAnnotation(input: {
  caseId: string;
  teamId: string;
  targetKind: WorkingAnnotationTarget;
  targetId: string;
  kind: WorkingAnnotationKind;
  range: string;
  body?: string | null;
  personId: string;
}): Promise<WorkingAnnotationRow> {
  const row: WorkingAnnotationRow = {
    id: randomUUID(),
    case_id: input.caseId,
    team_id: input.teamId,
    target_kind: input.targetKind,
    target_id: input.targetId,
    kind: input.kind,
    range: input.range,
    body: input.body ?? null,
    person_id: input.personId,
    created_at: nowIso(),
    created_by: input.personId,
  };

  if (isSampleDataMode()) {
    sample.push(row);
    return row;
  }

  const { data, error } = await getServiceSupabase()
    .from("working_annotations")
    .insert({
      id: row.id,
      case_id: row.case_id,
      team_id: row.team_id,
      target_kind: row.target_kind,
      target_id: row.target_id,
      kind: row.kind,
      range: row.range,
      body: row.body,
      person_id: row.person_id,
      created_at: row.created_at,
      created_by: row.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createWorkingAnnotation: ${error.message}`);
  return mapRow(data as Row);
}
