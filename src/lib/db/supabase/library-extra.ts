import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { listLibraryFiles } from "@/lib/db/library-repository";
import { readStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { iso, type Row } from "@/lib/db/supabase/util";
import { embedPassageText, cosine } from "@/lib/library/embeddings";
import { runDriveSync } from "@/lib/library/sync";
import type { CaseRow } from "@/lib/types";

/**
 * Workstream F extras. Do not edit existing functions in library.ts —
 * add new reads/writes here and dispatch with isSampleDataMode().
 *
 * Migration slot: 00016 (00016b if needed). Workstream H owns Librarian
 * prompts, Researcher, and pgvector `match_passages` (00011). Until H
 * lands, digest/search stay minimal behind callCruxy / embedCruxy.
 */

export type RelatedLibraryFile = {
  id: string;
  name: string;
  path: string | null;
  type: string | null;
  case_numbers: number[];
  drive_id: string | null;
  modified_at: string | null;
};

function mapFileLite(r: Row): RelatedLibraryFile {
  return {
    id: r.id,
    name: r.name ?? "",
    path: r.path ?? null,
    type: r.type ?? null,
    case_numbers: r.case_numbers ?? [],
    drive_id: r.drive_id ?? null,
    modified_at: r.modified_at ? iso(r.modified_at) : null,
  };
}

/** Other digested files for the same case numbers (Reading room tabs). */
export async function listRelatedFilesForCases(
  caseNumbers: number[],
  excludeFileId?: string,
): Promise<RelatedLibraryFile[]> {
  if (caseNumbers.length === 0) return [];

  if (isSampleDataMode()) {
    const store = await readStore();
    return store.files
      .filter(
        (f) =>
          f.id !== excludeFileId &&
          f.case_numbers.some((n) => caseNumbers.includes(n)),
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        type: f.type,
        case_numbers: f.case_numbers,
        drive_id: f.drive_id,
        modified_at: f.modified_at,
      }));
  }

  const { data, error } = await getServiceSupabase()
    .from("files")
    .select("id,name,path,type,case_numbers,drive_id,modified_at")
    .order("name", { ascending: true })
    .limit(200);
  assertOk(error, "listRelatedFilesForCases");
  return (data ?? [])
    .map(mapFileLite)
    .filter(
      (f) =>
        f.id !== excludeFileId &&
        f.case_numbers.some((n) => caseNumbers.includes(n)),
    );
}

/** Case set pages for the reading room side panel. */
export async function listCasePagesForNumbers(
  caseNumbers: number[],
): Promise<
  Pick<
    CaseRow,
    "id" | "number" | "title" | "case_set_page" | "crux" | "trap"
  >[]
> {
  if (caseNumbers.length === 0) return [];
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.cases
      .filter((c) => caseNumbers.includes(c.number))
      .map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        case_set_page: c.case_set_page,
        crux: c.crux,
        trap: c.trap,
      }));
  }
  const { data, error } = await getServiceSupabase()
    .from("cases")
    .select("id,number,title,case_set_page,crux,trap")
    .in("number", caseNumbers)
    .order("number", { ascending: true });
  assertOk(error, "listCasePagesForNumbers");
  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    case_set_page: r.case_set_page ?? null,
    crux: r.crux ?? null,
    trap: r.trap ?? null,
  }));
}

/**
 * Interim cosine search until Workstream H's match_passages RPC lands.
 * Embeds the query with the embed tier; falls back to stub vectors.
 */
export async function searchLibraryWithEmbed(input: {
  q: string;
  caseNumber?: number;
  type?: string;
  limit?: number;
  personId?: string | null;
}): Promise<
  {
    passage_id: string;
    file_id: string;
    file_name: string;
    drive_id: string | null;
    anchor: string;
    text: string;
    score: number;
  }[]
> {
  const q = input.q.trim();
  if (!q) return [];
  const limit = input.limit ?? 20;
  const emb = await embedPassageText(q, {
    personId: input.personId,
    feature: "library_search_embed",
  });

  if (isSampleDataMode()) {
    const store = await readStore();
    const hits: {
      passage_id: string;
      file_id: string;
      file_name: string;
      drive_id: string | null;
      anchor: string;
      text: string;
      score: number;
    }[] = [];
    for (const p of store.passages) {
      const file = store.files.find((f) => f.id === p.file_id);
      if (!file) continue;
      if (
        input.caseNumber != null &&
        !file.case_numbers.includes(input.caseNumber)
      ) {
        continue;
      }
      if (input.type && file.type !== input.type) continue;
      const score = cosine(emb.embedding, p.embedding ?? emb.embedding);
      hits.push({
        passage_id: p.id,
        file_id: file.id,
        file_name: file.name,
        drive_id: file.drive_id,
        anchor: p.anchor,
        text: p.text.slice(0, 400),
        score,
      });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  const { data, error } = await getServiceSupabase()
    .from("passages")
    .select(
      "id,file_id,drive_id,anchor,text,embedding,files!inner(id,name,drive_id,type,case_numbers)",
    )
    .limit(2000);
  assertOk(error, "searchLibraryWithEmbed");

  const hits: {
    passage_id: string;
    file_id: string;
    file_name: string;
    drive_id: string | null;
    anchor: string;
    text: string;
    score: number;
  }[] = [];

  for (const row of data ?? []) {
    const file = row.files as unknown as {
      id: string;
      name: string;
      drive_id: string | null;
      type: string | null;
      case_numbers: number[];
    };
    if (
      input.caseNumber != null &&
      !(file.case_numbers ?? []).includes(input.caseNumber)
    ) {
      continue;
    }
    if (input.type && file.type !== input.type) continue;
    let vec: number[] = [];
    const raw = row.embedding;
    if (Array.isArray(raw)) vec = raw as number[];
    else if (typeof raw === "string") {
      try {
        vec = JSON.parse(raw) as number[];
      } catch {
        vec = [];
      }
    }
    const score = vec.length ? cosine(emb.embedding, vec) : 0;
    hits.push({
      passage_id: row.id,
      file_id: file.id,
      file_name: file.name,
      drive_id: file.drive_id,
      anchor: row.anchor,
      text: String(row.text).slice(0, 400),
      score,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Live library counts for the program map (files + passages). */
export async function countLibraryForProgramMap(): Promise<{
  drive_files: number;
  passages: number;
}> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return {
      drive_files: store.files.length,
      passages: store.passages.length,
    };
  }
  const sb = getServiceSupabase();
  const [files, passages] = await Promise.all([
    sb.from("files").select("id", { count: "exact", head: true }),
    sb.from("passages").select("id", { count: "exact", head: true }),
  ]);
  assertOk(files.error, "countLibraryForProgramMap.files");
  assertOk(passages.error, "countLibraryForProgramMap.passages");
  return {
    drive_files: files.count ?? 0,
    passages: passages.count ?? 0,
  };
}

/**
 * Local sample mode: if the library is empty, digest the sample Drive tree
 * once so Reading room and shots have real passages without a Sync click.
 * Never runs on Vercel.
 */
export async function ensureSampleLibraryBootstrapped(
  personId?: string | null,
): Promise<{ bootstrapped: boolean; fileCount: number }> {
  if (!isSampleDataMode()) {
    const files = await listLibraryFiles();
    return { bootstrapped: false, fileCount: files.length };
  }
  const existing = await listLibraryFiles();
  if (existing.length > 0) {
    return { bootstrapped: false, fileCount: existing.length };
  }
  const result = await runDriveSync({
    mode: "sample",
    personId: personId ?? null,
    forceHeuristic: true,
  });
  return {
    bootstrapped: true,
    fileCount: result.run.files_processed,
  };
}
