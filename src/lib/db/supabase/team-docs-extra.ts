/**
 * Workstream H Wave 4: team doc import persistence.
 */
import "server-only";

import { getServiceSupabase } from "@/lib/db/supabase/client";
import { isSampleDataMode } from "@/lib/db/config";

export type TeamDocImportRow = {
  id: string;
  team_id: string;
  case_id: string;
  source_kind: "drive" | "paste";
  drive_file_id: string | null;
  title: string;
  checksum: string;
  text_preview: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};

export type TeamDocPassageRow = {
  id: string;
  import_id: string;
  team_id: string;
  case_id: string;
  anchor: string;
  text: string;
  ord: number;
  created_at: string;
  created_by: string | null;
};

/** In-memory sample store. */
const sampleImports: TeamDocImportRow[] = [];
const samplePassages: TeamDocPassageRow[] = [];

export async function findTeamDocImport(input: {
  teamId: string;
  driveFileId?: string | null;
  importId?: string | null;
  /** Match a prior paste (or any source) by content checksum for this team+case. */
  checksum?: string | null;
  caseId?: string | null;
}): Promise<TeamDocImportRow | null> {
  if (isSampleDataMode()) {
    if (input.importId) {
      return sampleImports.find((r) => r.id === input.importId) ?? null;
    }
    if (input.driveFileId) {
      return (
        sampleImports.find(
          (r) =>
            r.team_id === input.teamId && r.drive_file_id === input.driveFileId,
        ) ?? null
      );
    }
    if (input.checksum) {
      return (
        sampleImports.find(
          (r) =>
            r.team_id === input.teamId &&
            r.checksum === input.checksum &&
            (!input.caseId || r.case_id === input.caseId),
        ) ?? null
      );
    }
    return null;
  }

  const sb = getServiceSupabase();
  if (input.importId) {
    const { data, error } = await sb
      .from("team_doc_imports")
      .select("*")
      .eq("id", input.importId)
      .maybeSingle();
    if (error) throw new Error(`team_doc_imports: ${error.message}`);
    return (data as TeamDocImportRow) ?? null;
  }
  if (input.driveFileId) {
    const { data, error } = await sb
      .from("team_doc_imports")
      .select("*")
      .eq("team_id", input.teamId)
      .eq("drive_file_id", input.driveFileId)
      .maybeSingle();
    if (error) throw new Error(`team_doc_imports: ${error.message}`);
    return (data as TeamDocImportRow) ?? null;
  }
  if (input.checksum) {
    let q = sb
      .from("team_doc_imports")
      .select("*")
      .eq("team_id", input.teamId)
      .eq("checksum", input.checksum)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (input.caseId) q = q.eq("case_id", input.caseId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(`team_doc_imports: ${error.message}`);
    return (data as TeamDocImportRow) ?? null;
  }
  return null;
}

export async function upsertTeamDocImport(
  row: TeamDocImportRow,
): Promise<TeamDocImportRow> {
  if (isSampleDataMode()) {
    const idx = sampleImports.findIndex((r) => r.id === row.id);
    if (idx >= 0) sampleImports[idx] = row;
    else sampleImports.unshift(row);
    return row;
  }

  const { data, error } = await getServiceSupabase()
    .from("team_doc_imports")
    .upsert({
      id: row.id,
      team_id: row.team_id,
      case_id: row.case_id,
      source_kind: row.source_kind,
      drive_file_id: row.drive_file_id,
      title: row.title,
      checksum: row.checksum,
      text_preview: row.text_preview,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
    .select("*")
    .single();
  if (error) throw new Error(`team_doc_imports upsert: ${error.message}`);
  return data as TeamDocImportRow;
}

export async function replaceTeamDocPassages(
  importId: string,
  passages: TeamDocPassageRow[],
): Promise<void> {
  if (isSampleDataMode()) {
    for (let i = samplePassages.length - 1; i >= 0; i--) {
      if (samplePassages[i]!.import_id === importId) samplePassages.splice(i, 1);
    }
    samplePassages.push(...passages);
    return;
  }

  const sb = getServiceSupabase();
  const { error: delErr } = await sb
    .from("team_doc_passages")
    .delete()
    .eq("import_id", importId);
  if (delErr) throw new Error(`team_doc_passages delete: ${delErr.message}`);
  if (!passages.length) return;
  const { error } = await sb.from("team_doc_passages").insert(
    passages.map((p) => ({
      id: p.id,
      import_id: p.import_id,
      team_id: p.team_id,
      case_id: p.case_id,
      anchor: p.anchor,
      text: p.text,
      ord: p.ord,
      created_by: p.created_by,
      created_at: p.created_at,
    })),
  );
  if (error) throw new Error(`team_doc_passages insert: ${error.message}`);
}

export async function listTeamDocImports(input: {
  teamId: string;
  caseId?: string | null;
  limit?: number;
}): Promise<TeamDocImportRow[]> {
  if (isSampleDataMode()) {
    return sampleImports
      .filter(
        (r) =>
          r.team_id === input.teamId &&
          (!input.caseId || r.case_id === input.caseId),
      )
      .slice(0, input.limit ?? 20);
  }

  let q = getServiceSupabase()
    .from("team_doc_imports")
    .select("*")
    .eq("team_id", input.teamId)
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 20);
  if (input.caseId) q = q.eq("case_id", input.caseId);
  const { data, error } = await q;
  if (error) throw new Error(`team_doc_imports list: ${error.message}`);
  return (data ?? []) as TeamDocImportRow[];
}

export async function listProposalIdeaKeysForTeamCase(input: {
  teamId: string;
  caseId: string;
  origin?: string;
  originRefPrefix?: string;
}): Promise<Set<string>> {
  if (isSampleDataMode()) {
    const { readStore } = await import("@/lib/db/sample-store");
    const store = await readStore();
    return new Set(
      store.proposals
        .filter(
          (p) =>
            p.team_id === input.teamId &&
            p.case_id === input.caseId &&
            (!input.origin || p.origin === input.origin) &&
            (!input.originRefPrefix ||
              (p.origin_ref ?? "").startsWith(input.originRefPrefix)),
        )
        .map((p) => p.idea_key),
    );
  }

  let q = getServiceSupabase()
    .from("proposals")
    .select("idea_key, origin_ref")
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId);
  if (input.origin) q = q.eq("origin", input.origin);
  const { data, error } = await q;
  if (error) throw new Error(`proposals idea keys: ${error.message}`);
  const keys = new Set<string>();
  for (const row of data ?? []) {
    if (
      input.originRefPrefix &&
      !(String(row.origin_ref ?? "").startsWith(input.originRefPrefix))
    ) {
      continue;
    }
    if (row.idea_key) keys.add(String(row.idea_key));
  }
  return keys;
}

export function __clearSampleTeamDocsForTests(): void {
  sampleImports.length = 0;
  samplePassages.length = 0;
}
