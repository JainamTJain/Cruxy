import "server-only";

import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import type { FileSegment } from "@/lib/library/segments";
import { iso, type Row } from "@/lib/db/supabase/util";

function mapSegment(r: Row): FileSegment {
  return {
    id: r.id,
    file_id: r.file_id,
    case_id: r.case_id ?? null,
    kind: r.kind,
    title: r.title ?? "",
    body: r.body ?? "",
    speaker_name: r.speaker_name ?? null,
    ord: r.ord ?? 0,
    citation_anchor: r.citation_anchor ?? null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    created_by: r.created_by ?? null,
  };
}

export async function listSegmentsForFile(
  fileId: string,
): Promise<FileSegment[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.file_segments ?? [])
      .filter((s) => s.file_id === fileId)
      .sort((a, b) => a.ord - b.ord);
  }
  const { data, error } = await getServiceSupabase()
    .from("file_segments")
    .select("*")
    .eq("file_id", fileId)
    .order("ord", { ascending: true });
  assertOk(error, "listSegmentsForFile");
  return (data ?? []).map(mapSegment);
}

export async function listSegmentsForCase(
  caseId: string,
): Promise<FileSegment[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.file_segments ?? [])
      .filter((s) => s.case_id === caseId)
      .sort((a, b) => a.ord - b.ord);
  }
  const { data, error } = await getServiceSupabase()
    .from("file_segments")
    .select("*")
    .eq("case_id", caseId)
    .order("ord", { ascending: true });
  assertOk(error, "listSegmentsForCase");
  return (data ?? []).map(mapSegment);
}

/**
 * Replace a file's segments. With `caseId`, only that case's segments for the
 * file are replaced, so a file shared by several cases is not wiped each time
 * another case opens. Without it (a fresh Drive sync), every case's go.
 */
export async function replaceFileSegments(
  fileId: string,
  segments: FileSegment[],
  caseId?: string,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      s.file_segments = (s.file_segments ?? []).filter(
        (x) => !(x.file_id === fileId && (!caseId || x.case_id === caseId)),
      );
      s.file_segments.push(...segments);
    });
    return;
  }
  const sb = getServiceSupabase();
  let del = sb.from("file_segments").delete().eq("file_id", fileId);
  if (caseId) del = del.eq("case_id", caseId);
  const { error: delErr } = await del;
  assertOk(delErr, "replaceFileSegments(delete)");
  if (segments.length === 0) return;
  const { error } = await sb.from("file_segments").insert(
    segments.map((s) => ({
      id: s.id,
      file_id: s.file_id,
      case_id: s.case_id,
      kind: s.kind,
      title: s.title,
      body: s.body,
      speaker_name: s.speaker_name,
      ord: s.ord,
      citation_anchor: s.citation_anchor,
      created_at: s.created_at,
      updated_at: s.updated_at,
      created_by: s.created_by,
    })),
  );
  assertOk(error, "replaceFileSegments(insert)");
}

export async function listStakeholdersForCase(caseId: string): Promise<
  {
    id: string;
    case_id: string;
    who: string;
    stake: string;
    voice_in_case: string | null;
    ord: number;
  }[]
> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.case_stakeholders ?? [])
      .filter((s) => s.case_id === caseId)
      .sort((a, b) => a.ord - b.ord)
      .map((s) => ({
        id: s.id,
        case_id: s.case_id,
        who: s.who,
        stake: s.stake,
        voice_in_case: s.voice_in_case,
        ord: s.ord,
      }));
  }
  const { data, error } = await getServiceSupabase()
    .from("case_stakeholders")
    .select("id,case_id,who,stake,voice_in_case,ord")
    .eq("case_id", caseId)
    .order("ord", { ascending: true });
  assertOk(error, "listStakeholdersForCase");
  return (data ?? []).map((r) => ({
    id: r.id,
    case_id: r.case_id,
    who: r.who ?? "",
    stake: r.stake ?? "",
    voice_in_case: r.voice_in_case ?? null,
    ord: r.ord ?? 0,
  }));
}
