/**
 * Wave 8 C: Team Brief persistence (*-extra for shared boundary).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type BriefMode = "own_doc" | "build_in_crux";

export type TeamBriefRow = {
  id: string;
  team_id: string;
  case_id: string;
  mode: BriefMode;
  drive_file_id: string | null;
  drive_title: string | null;
  thesis: string | null;
  stance_version: number;
  confirmed_by: string[];
  drift_flag: boolean;
  drift_detail: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type BriefChecklistItemRow = {
  id: string;
  brief_id: string;
  proposal_id: string | null;
  text: string;
  kind: "suggestion" | "evidence" | "question" | "counter" | "inspired";
  done: boolean;
  created_at: string;
  created_by: string | null;
  done_at: string | null;
  done_by: string | null;
};

export type LibraryCandidateRow = {
  id: string;
  team_id: string;
  case_id: string;
  brief_id: string | null;
  text: string;
  citation: string | null;
  status: "pending" | "accepted" | "rejected";
  source_passage_id: string | null;
  created_at: string;
  created_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
};

const sampleBriefs: TeamBriefRow[] = [];
const sampleChecklist: BriefChecklistItemRow[] = [];
const sampleCandidates: LibraryCandidateRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function getTeamBrief(
  teamId: string,
  caseId: string,
): Promise<TeamBriefRow | null> {
  if (isSampleDataMode()) {
    return (
      sampleBriefs.find(
        (b) => b.team_id === teamId && b.case_id === caseId,
      ) ?? null
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("team_briefs")
    .select("*")
    .eq("team_id", teamId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(`getTeamBrief: ${error.message}`);
  return (data as TeamBriefRow | null) ?? null;
}

export async function listTeamBriefsForCase(
  caseId: string,
): Promise<TeamBriefRow[]> {
  if (isSampleDataMode()) {
    return sampleBriefs.filter((b) => b.case_id === caseId);
  }
  const { data, error } = await getServiceSupabase()
    .from("team_briefs")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw new Error(`listTeamBriefsForCase: ${error.message}`);
  return (data as TeamBriefRow[]) ?? [];
}

export async function listLinkedOwnDocBriefs(): Promise<TeamBriefRow[]> {
  if (isSampleDataMode()) {
    return sampleBriefs.filter(
      (b) => b.mode === "own_doc" && Boolean(b.drive_file_id),
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("team_briefs")
    .select("*")
    .eq("mode", "own_doc")
    .not("drive_file_id", "is", null);
  if (error) throw new Error(`listLinkedOwnDocBriefs: ${error.message}`);
  return (data as TeamBriefRow[]) ?? [];
}

export async function upsertTeamBrief(
  input: Partial<TeamBriefRow> & {
    team_id: string;
    case_id: string;
    mode: BriefMode;
  },
): Promise<TeamBriefRow> {
  const existing = await getTeamBrief(input.team_id, input.case_id);
  const row: TeamBriefRow = {
    id: existing?.id ?? input.id ?? randomUUID(),
    team_id: input.team_id,
    case_id: input.case_id,
    mode: input.mode,
    drive_file_id:
      input.drive_file_id !== undefined
        ? input.drive_file_id
        : (existing?.drive_file_id ?? null),
    drive_title:
      input.drive_title !== undefined
        ? input.drive_title
        : (existing?.drive_title ?? null),
    thesis:
      input.thesis !== undefined ? input.thesis : (existing?.thesis ?? null),
    stance_version:
      input.stance_version !== undefined
        ? input.stance_version
        : (existing?.stance_version ?? 0),
    confirmed_by:
      input.confirmed_by !== undefined
        ? input.confirmed_by
        : (existing?.confirmed_by ?? []),
    drift_flag:
      input.drift_flag !== undefined
        ? input.drift_flag
        : (existing?.drift_flag ?? false),
    drift_detail:
      input.drift_detail !== undefined
        ? input.drift_detail
        : (existing?.drift_detail ?? null),
    last_synced_at:
      input.last_synced_at !== undefined
        ? input.last_synced_at
        : (existing?.last_synced_at ?? null),
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    created_by:
      input.created_by !== undefined
        ? input.created_by
        : (existing?.created_by ?? null),
  };

  if (isSampleDataMode()) {
    const i = sampleBriefs.findIndex((b) => b.id === row.id);
    if (i >= 0) sampleBriefs[i] = row;
    else sampleBriefs.push(row);
    return row;
  }

  const { data, error } = await getServiceSupabase()
    .from("team_briefs")
    .upsert(
      {
        id: row.id,
        team_id: row.team_id,
        case_id: row.case_id,
        mode: row.mode,
        drive_file_id: row.drive_file_id,
        drive_title: row.drive_title,
        thesis: row.thesis,
        stance_version: row.stance_version,
        confirmed_by: row.confirmed_by,
        drift_flag: row.drift_flag,
        drift_detail: row.drift_detail,
        last_synced_at: row.last_synced_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
      },
      { onConflict: "team_id,case_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertTeamBrief: ${error.message}`);
  return data as TeamBriefRow;
}

export async function listChecklist(
  briefId: string,
): Promise<BriefChecklistItemRow[]> {
  if (isSampleDataMode()) {
    return sampleChecklist
      .filter((c) => c.brief_id === briefId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const { data, error } = await getServiceSupabase()
    .from("brief_checklist_items")
    .select("*")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listChecklist: ${error.message}`);
  return (data as BriefChecklistItemRow[]) ?? [];
}

export async function addChecklistItem(input: {
  brief_id: string;
  proposal_id?: string | null;
  text: string;
  kind?: BriefChecklistItemRow["kind"];
  created_by?: string | null;
}): Promise<BriefChecklistItemRow> {
  const row: BriefChecklistItemRow = {
    id: randomUUID(),
    brief_id: input.brief_id,
    proposal_id: input.proposal_id ?? null,
    text: input.text,
    kind: input.kind ?? "suggestion",
    done: false,
    created_at: nowIso(),
    created_by: input.created_by ?? null,
    done_at: null,
    done_by: null,
  };
  if (isSampleDataMode()) {
    sampleChecklist.push(row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("brief_checklist_items")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`addChecklistItem: ${error.message}`);
  return data as BriefChecklistItemRow;
}

export async function setChecklistDone(input: {
  id: string;
  done: boolean;
  personId: string;
}): Promise<BriefChecklistItemRow | null> {
  if (isSampleDataMode()) {
    const i = sampleChecklist.findIndex((c) => c.id === input.id);
    if (i < 0) return null;
    sampleChecklist[i] = {
      ...sampleChecklist[i]!,
      done: input.done,
      done_at: input.done ? nowIso() : null,
      done_by: input.done ? input.personId : null,
    };
    return sampleChecklist[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("brief_checklist_items")
    .update({
      done: input.done,
      done_at: input.done ? nowIso() : null,
      done_by: input.done ? input.personId : null,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`setChecklistDone: ${error.message}`);
  return (data as BriefChecklistItemRow | null) ?? null;
}

export async function listLibraryCandidates(opts: {
  caseId: string;
  status?: LibraryCandidateRow["status"];
}): Promise<LibraryCandidateRow[]> {
  if (isSampleDataMode()) {
    return sampleCandidates.filter(
      (c) =>
        c.case_id === opts.caseId &&
        (!opts.status || c.status === opts.status),
    );
  }
  let q = getServiceSupabase()
    .from("library_candidates")
    .select("*")
    .eq("case_id", opts.caseId)
    .order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(`listLibraryCandidates: ${error.message}`);
  return (data as LibraryCandidateRow[]) ?? [];
}

export async function upsertLibraryCandidate(input: {
  team_id: string;
  case_id: string;
  brief_id?: string | null;
  text: string;
  citation?: string | null;
  source_passage_id?: string | null;
  created_by?: string | null;
}): Promise<LibraryCandidateRow> {
  const text = input.text.trim();
  if (isSampleDataMode()) {
    const existing = sampleCandidates.find(
      (c) =>
        c.team_id === input.team_id &&
        c.case_id === input.case_id &&
        c.text === text &&
        c.status === "pending",
    );
    if (existing) return existing;
    const row: LibraryCandidateRow = {
      id: randomUUID(),
      team_id: input.team_id,
      case_id: input.case_id,
      brief_id: input.brief_id ?? null,
      text,
      citation: input.citation ?? null,
      status: "pending",
      source_passage_id: input.source_passage_id ?? null,
      created_at: nowIso(),
      created_by: input.created_by ?? null,
      decided_at: null,
      decided_by: null,
    };
    sampleCandidates.push(row);
    return row;
  }

  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("library_candidates")
    .select("*")
    .eq("team_id", input.team_id)
    .eq("case_id", input.case_id)
    .eq("text", text)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return existing as LibraryCandidateRow;

  const { data, error } = await sb
    .from("library_candidates")
    .insert({
      team_id: input.team_id,
      case_id: input.case_id,
      brief_id: input.brief_id ?? null,
      text,
      citation: input.citation ?? null,
      source_passage_id: input.source_passage_id ?? null,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`upsertLibraryCandidate: ${error.message}`);
  return data as LibraryCandidateRow;
}

export async function decideLibraryCandidate(input: {
  id: string;
  status: "accepted" | "rejected";
  personId: string;
}): Promise<LibraryCandidateRow | null> {
  if (isSampleDataMode()) {
    const i = sampleCandidates.findIndex((c) => c.id === input.id);
    if (i < 0) return null;
    sampleCandidates[i] = {
      ...sampleCandidates[i]!,
      status: input.status,
      decided_at: nowIso(),
      decided_by: input.personId,
    };
    return sampleCandidates[i]!;
  }
  const { data, error } = await getServiceSupabase()
    .from("library_candidates")
    .update({
      status: input.status,
      decided_at: nowIso(),
      decided_by: input.personId,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`decideLibraryCandidate: ${error.message}`);
  return (data as LibraryCandidateRow | null) ?? null;
}
