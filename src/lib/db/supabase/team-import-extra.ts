/**
 * Team-level document import batches (migration 00072).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type TeamDocBatchStatus = "review" | "confirmed" | "cancelled";
export type SplitKind = "found" | "not_in_regional" | "unmatched";

export type TeamDocBatchRow = {
  id: string;
  team_id: string;
  status: TeamDocBatchStatus;
  created_at: string;
  created_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

export type TeamDocBatchSourceRow = {
  id: string;
  batch_id: string;
  drive_file_id: string | null;
  drive_url: string | null;
  title: string;
  body_text: string;
  checksum: string | null;
  created_at: string;
};

export type TeamDocBatchSplitRow = {
  id: string;
  batch_id: string;
  source_id: string | null;
  kind: SplitKind;
  case_number: number | null;
  case_id: string | null;
  title_guess: string | null;
  section_count: number;
  body_text: string;
  change_summary: string | null;
  assigned_case_id: string | null;
  created_at: string;
};

const sampleBatches: TeamDocBatchRow[] = [];
const sampleSources: TeamDocBatchSourceRow[] = [];
const sampleSplits: TeamDocBatchSplitRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function insertTeamDocBatch(opts: {
  teamId: string;
  personId: string;
}): Promise<TeamDocBatchRow> {
  const row: TeamDocBatchRow = {
    id: randomUUID(),
    team_id: opts.teamId,
    status: "review",
    created_at: nowIso(),
    created_by: opts.personId,
    confirmed_at: null,
    confirmed_by: null,
  };
  if (isSampleDataMode()) {
    sampleBatches.push(row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batches")
    .insert({
      id: row.id,
      team_id: row.team_id,
      status: row.status,
      created_by: row.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertTeamDocBatch: ${error.message}`);
  return data as TeamDocBatchRow;
}

export async function getTeamDocBatch(
  id: string,
): Promise<TeamDocBatchRow | null> {
  if (isSampleDataMode()) {
    return sampleBatches.find((b) => b.id === id) ?? null;
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTeamDocBatch: ${error.message}`);
  return (data as TeamDocBatchRow) ?? null;
}

export async function latestOpenBatchForTeam(
  teamId: string,
): Promise<TeamDocBatchRow | null> {
  if (isSampleDataMode()) {
    return (
      sampleBatches
        .filter((b) => b.team_id === teamId && b.status === "review")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batches")
    .select("*")
    .eq("team_id", teamId)
    .eq("status", "review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latestOpenBatchForTeam: ${error.message}`);
  return (data as TeamDocBatchRow) ?? null;
}

export async function confirmTeamDocBatch(opts: {
  id: string;
  personId: string;
}): Promise<TeamDocBatchRow | null> {
  if (isSampleDataMode()) {
    const i = sampleBatches.findIndex((b) => b.id === opts.id);
    if (i < 0) return null;
    sampleBatches[i] = {
      ...sampleBatches[i]!,
      status: "confirmed",
      confirmed_at: nowIso(),
      confirmed_by: opts.personId,
    };
    return sampleBatches[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batches")
    .update({
      status: "confirmed",
      confirmed_at: nowIso(),
      confirmed_by: opts.personId,
    })
    .eq("id", opts.id)
    .select("*")
    .single();
  if (error) throw new Error(`confirmTeamDocBatch: ${error.message}`);
  return data as TeamDocBatchRow;
}

export async function insertBatchSource(
  input: Omit<TeamDocBatchSourceRow, "id" | "created_at"> & { id?: string },
): Promise<TeamDocBatchSourceRow> {
  const row: TeamDocBatchSourceRow = {
    id: input.id ?? randomUUID(),
    batch_id: input.batch_id,
    drive_file_id: input.drive_file_id,
    drive_url: input.drive_url,
    title: input.title,
    body_text: input.body_text,
    checksum: input.checksum,
    created_at: nowIso(),
  };
  if (isSampleDataMode()) {
    sampleSources.push(row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batch_sources")
    .insert({
      id: row.id,
      batch_id: row.batch_id,
      drive_file_id: row.drive_file_id,
      drive_url: row.drive_url,
      title: row.title,
      body_text: row.body_text,
      checksum: row.checksum,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertBatchSource: ${error.message}`);
  return data as TeamDocBatchSourceRow;
}

export async function listBatchSources(
  batchId: string,
): Promise<TeamDocBatchSourceRow[]> {
  if (isSampleDataMode()) {
    return sampleSources.filter((s) => s.batch_id === batchId);
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batch_sources")
    .select("*")
    .eq("batch_id", batchId);
  if (error) throw new Error(`listBatchSources: ${error.message}`);
  return (data ?? []) as TeamDocBatchSourceRow[];
}

export async function insertBatchSplit(
  input: Omit<TeamDocBatchSplitRow, "id" | "created_at"> & { id?: string },
): Promise<TeamDocBatchSplitRow> {
  const row: TeamDocBatchSplitRow = {
    id: input.id ?? randomUUID(),
    batch_id: input.batch_id,
    source_id: input.source_id,
    kind: input.kind,
    case_number: input.case_number,
    case_id: input.case_id,
    title_guess: input.title_guess,
    section_count: input.section_count,
    body_text: input.body_text.replace(/[·—–]/g, ","),
    change_summary: input.change_summary,
    assigned_case_id: input.assigned_case_id,
    created_at: nowIso(),
  };
  if (isSampleDataMode()) {
    sampleSplits.push(row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batch_splits")
    .insert({
      id: row.id,
      batch_id: row.batch_id,
      source_id: row.source_id,
      kind: row.kind,
      case_number: row.case_number,
      case_id: row.case_id,
      title_guess: row.title_guess,
      section_count: row.section_count,
      body_text: row.body_text,
      change_summary: row.change_summary,
      assigned_case_id: row.assigned_case_id,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertBatchSplit: ${error.message}`);
  return data as TeamDocBatchSplitRow;
}

export async function listBatchSplits(
  batchId: string,
): Promise<TeamDocBatchSplitRow[]> {
  if (isSampleDataMode()) {
    return sampleSplits.filter((s) => s.batch_id === batchId);
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batch_splits")
    .select("*")
    .eq("batch_id", batchId)
    .order("case_number", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`listBatchSplits: ${error.message}`);
  return (data ?? []) as TeamDocBatchSplitRow[];
}

export async function updateSplitAssignment(opts: {
  id: string;
  assignedCaseId: string | null;
}): Promise<TeamDocBatchSplitRow | null> {
  if (isSampleDataMode()) {
    const i = sampleSplits.findIndex((s) => s.id === opts.id);
    if (i < 0) return null;
    sampleSplits[i] = {
      ...sampleSplits[i]!,
      assigned_case_id: opts.assignedCaseId,
      kind: opts.assignedCaseId ? "found" : sampleSplits[i]!.kind,
      case_id: opts.assignedCaseId ?? sampleSplits[i]!.case_id,
    };
    return sampleSplits[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("team_doc_batch_splits")
    .update({
      assigned_case_id: opts.assignedCaseId,
      case_id: opts.assignedCaseId,
      kind: opts.assignedCaseId ? "found" : undefined,
    })
    .eq("id", opts.id)
    .select("*")
    .single();
  if (error) throw new Error(`updateSplitAssignment: ${error.message}`);
  return data as TeamDocBatchSplitRow;
}

export async function clearBatchSplits(batchId: string): Promise<void> {
  if (isSampleDataMode()) {
    for (let i = sampleSplits.length - 1; i >= 0; i--) {
      if (sampleSplits[i]!.batch_id === batchId) sampleSplits.splice(i, 1);
    }
    return;
  }
  const { error } = await getServiceSupabase()
    .from("team_doc_batch_splits")
    .delete()
    .eq("batch_id", batchId);
  if (error) throw new Error(`clearBatchSplits: ${error.message}`);
}
