import "server-only";
import { randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import {
  chunk,
  iso,
  isoOrNull,
  likeEscape,
  type Row,
} from "@/lib/db/supabase/util";
import type { SearchHit } from "@/lib/db/library-repository";
import { cosine, stubEmbed } from "@/lib/library/embeddings";
import {
  EMBEDDING_DIM,
  type BookRequest,
  type Comment,
  type Flashcard,
  type Highlight,
  type LibraryFile,
  type Passage,
  type ResearchRun,
  type SyncRun,
} from "@/lib/library/types";
import type { CaseRow, Team } from "@/lib/types";
import { nowIso } from "@/lib/utils";

/** passages.embedding is vector(1536); stub vectors are shorter, so pad with zeros (cosine is unchanged). */
const DB_EMBEDDING_DIM = 1536;
const IN_CHUNK = 100;
const INSERT_CHUNK = 100;
const SEARCH_PAGE = 200;
const SEARCH_MAX_SCAN = 20000;

function mapCase(r: Row): CaseRow {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    case_set_page: r.case_set_page ?? null,
    crux: r.crux ?? null,
    trap: r.trap ?? null,
    closing_question: r.closing_question ?? null,
    active: r.active,
    created_at: iso(r.created_at),
  };
}

function mapTeam(r: Row): Team {
  return {
    id: r.id,
    name: r.name,
    colour: r.colour,
    created_at: iso(r.created_at),
  };
}

function mapFile(r: Row): LibraryFile {
  return {
    id: r.id,
    drive_id: r.drive_id ?? null,
    name: r.name ?? "",
    path: r.path ?? null,
    mime: r.mime ?? null,
    modified_at: isoOrNull(r.modified_at),
    checksum: r.checksum ?? null,
    case_ids: r.case_ids ?? [],
    case_numbers: r.case_numbers ?? [],
    type: r.type ?? null,
    // confidence is a float4 column; trim float noise so 0.7 reads back as 0.7
    confidence:
      r.confidence == null ? null : Number(Number(r.confidence).toPrecision(6)),
    card: r.card ?? null,
    text_content: r.text_content ?? null,
    scanned_pdf: Boolean(r.scanned_pdf),
    unreadable_reason: r.unreadable_reason ?? null,
    status: r.status ?? "pending",
    extracted_ideas: r.extracted_ideas ?? [],
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function parseEmbedding(raw: unknown): number[] | null {
  if (raw == null) return null;
  let vec: number[];
  if (Array.isArray(raw)) vec = raw as number[];
  else if (typeof raw === "string") {
    try {
      vec = JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  } else return null;
  let end = vec.length;
  while (end > EMBEDDING_DIM && vec[end - 1] === 0) end--;
  return end === vec.length ? vec : vec.slice(0, end);
}

function serializeEmbedding(vec: number[] | null): string | null {
  if (!vec) return null;
  const padded =
    vec.length < DB_EMBEDDING_DIM
      ? [...vec, ...new Array<number>(DB_EMBEDDING_DIM - vec.length).fill(0)]
      : vec;
  return `[${padded.join(",")}]`;
}

function mapPassage(r: Row): Passage {
  return {
    id: r.id,
    file_id: r.file_id,
    drive_id: r.drive_id ?? null,
    anchor: r.anchor ?? "",
    text: r.text,
    embedding: parseEmbedding(r.embedding),
    ord: r.ord ?? 0,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapHighlight(r: Row): Highlight {
  return {
    id: r.id,
    passage_id: r.passage_id,
    range: r.range ?? "",
    person_id: r.person_id,
    body: r.body ?? null,
    thread_id: r.thread_id ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapComment(r: Row): Comment {
  return {
    id: r.id,
    passage_id: r.passage_id,
    range: r.range ?? null,
    person_id: r.person_id,
    body: r.body,
    thread_id: r.thread_id ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapSyncRun(r: Row): SyncRun {
  return {
    id: r.id,
    started_at: iso(r.started_at),
    finished_at: isoOrNull(r.finished_at),
    files_seen: r.files_seen,
    files_processed: r.files_processed,
    files_skipped_unchanged: r.files_skipped_unchanged,
    ai_calls: r.ai_calls,
    stub: r.stub,
    mode: r.mode,
    notes: r.notes ?? null,
  };
}

function mapResearchRun(r: Row): ResearchRun {
  return {
    id: r.id,
    case_id: r.case_id,
    gaps: r.gaps ?? [],
    findings: r.findings ?? [],
    claim_dossiers: (r.claim_dossiers as ResearchRun["claim_dossiers"]) ?? null,
    brief: (r.brief as ResearchRun["brief"]) ?? null,
    stub: r.stub,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapBookRequest(r: Row): BookRequest {
  return {
    id: r.id,
    title: r.title,
    reason: r.reason ?? null,
    chapter: r.chapter ?? null,
    case_id: r.case_id ?? null,
    status: r.status,
    upload_path: (r.upload_path as string | null) ?? null,
    library_file_id: (r.library_file_id as string | null) ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

export async function listCases(): Promise<CaseRow[]> {
  const { data, error } = await getServiceSupabase()
    .from("cases")
    .select("*")
    .order("number", { ascending: true });
  assertOk(error, "listCases");
  return (data ?? []).map(mapCase);
}

export async function listTeams(): Promise<Team[]> {
  const { data, error } = await getServiceSupabase()
    .from("teams")
    .select("*")
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });
  assertOk(error, "listTeams");
  return (data ?? []).map(mapTeam);
}

export async function listLibraryFiles(): Promise<LibraryFile[]> {
  const out: LibraryFile[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await getServiceSupabase()
      .from("files")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    assertOk(error, "listLibraryFiles");
    const rows = data ?? [];
    out.push(...rows.map(mapFile));
    if (rows.length < page) break;
  }
  return out;
}

export async function getLibraryFile(id: string): Promise<LibraryFile | null> {
  const { data, error } = await getServiceSupabase()
    .from("files")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertOk(error, "getLibraryFile");
  return data ? mapFile(data) : null;
}

export async function getLibraryFileByDriveId(
  driveId: string,
): Promise<LibraryFile | null> {
  const { data, error } = await getServiceSupabase()
    .from("files")
    .select("*")
    .eq("drive_id", driveId)
    .order("created_at", { ascending: true })
    .limit(1);
  assertOk(error, "getLibraryFileByDriveId");
  const row = data?.[0];
  return row ? mapFile(row) : null;
}

export async function saveLibraryFile(file: LibraryFile): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("files")
    .upsert(
      {
        id: file.id,
        drive_id: file.drive_id,
        name: file.name,
        path: file.path,
        mime: file.mime,
        modified_at: file.modified_at,
        checksum: file.checksum,
        case_ids: file.case_ids,
        case_numbers: file.case_numbers,
        type: file.type,
        confidence: file.confidence,
        card: file.card,
        text_content: file.text_content,
        scanned_pdf: file.scanned_pdf,
        unreadable_reason: file.unreadable_reason,
        status: file.status,
        extracted_ideas: file.extracted_ideas,
        created_at: file.created_at,
        created_by: file.created_by,
      },
      { onConflict: "id" },
    );
  assertOk(error, "saveLibraryFile");
}

function passageInsertRow(p: Passage): Row {
  return {
    id: p.id,
    file_id: p.file_id,
    drive_id: p.drive_id,
    anchor: p.anchor,
    text: p.text,
    embedding: serializeEmbedding(p.embedding),
    embedding_stub: Boolean(p.embedding_stub),
    ord: p.ord,
    created_at: p.created_at,
    created_by: p.created_by,
  };
}

/**
 * Replaces a file's passages. Highlights and comments hold foreign keys to
 * passages, so annotations on an old passage move to the new passage with the
 * same anchor. An old passage that still has annotations and no matching new
 * anchor is kept so nothing a student wrote is lost.
 */
export async function replaceFilePassages(
  fileId: string,
  passages: Passage[],
): Promise<void> {
  const sb = getServiceSupabase();

  const { data: existingRows, error: exErr } = await sb
    .from("passages")
    .select("id,anchor")
    .eq("file_id", fileId);
  assertOk(exErr, "replaceFilePassages(select existing)");
  const existing = existingRows ?? [];
  const newIds = new Set(passages.map((p) => p.id));

  for (const batch of chunk(passages, INSERT_CHUNK)) {
    const { error } = await sb
      .from("passages")
      .upsert(batch.map(passageInsertRow), { onConflict: "id" });
    assertOk(error, "replaceFilePassages(insert)");
  }

  const stale = existing.filter((r) => !newIds.has(r.id));
  if (stale.length === 0) return;

  const newByAnchor = new Map<string, string>();
  for (const p of passages) {
    if (!newByAnchor.has(p.anchor)) newByAnchor.set(p.anchor, p.id);
  }

  const staleIds = stale.map((r) => r.id as string);
  const referenced = new Set<string>();
  for (const ids of chunk(staleIds, IN_CHUNK)) {
    for (const table of ["highlights", "comments"] as const) {
      const { data, error } = await sb
        .from(table)
        .select("passage_id")
        .in("passage_id", ids);
      assertOk(error, `replaceFilePassages(select ${table})`);
      for (const r of data ?? []) referenced.add(r.passage_id as string);
    }
  }

  const deletable: string[] = [];
  for (const row of stale) {
    const id = row.id as string;
    if (!referenced.has(id)) {
      deletable.push(id);
      continue;
    }
    const target = newByAnchor.get(row.anchor ?? "");
    if (!target) continue;
    for (const table of ["highlights", "comments"] as const) {
      const { error } = await sb
        .from(table)
        .update({ passage_id: target })
        .eq("passage_id", id);
      assertOk(error, `replaceFilePassages(move ${table})`);
    }
    deletable.push(id);
  }

  for (const ids of chunk(deletable, IN_CHUNK)) {
    const { error } = await sb.from("passages").delete().in("id", ids);
    assertOk(error, "replaceFilePassages(delete stale)");
  }
}

export async function listPassagesForFile(fileId: string): Promise<Passage[]> {
  const { data, error } = await getServiceSupabase()
    .from("passages")
    .select("*")
    .eq("file_id", fileId)
    .order("ord", { ascending: true });
  assertOk(error, "listPassagesForFile");
  return (data ?? []).map(mapPassage);
}

export async function getPassage(id: string): Promise<Passage | null> {
  const { data, error } = await getServiceSupabase()
    .from("passages")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertOk(error, "getPassage");
  return data ? mapPassage(data) : null;
}

export async function listSortingQueue(): Promise<LibraryFile[]> {
  // Loose DB bound (float4 noise); exact 0.7 rule is applied after mapping.
  const { data, error } = await getServiceSupabase()
    .from("files")
    .select("*")
    .or("status.eq.sorting_queue,confidence.lt.0.7001")
    .order("created_at", { ascending: true });
  assertOk(error, "listSortingQueue");
  return (data ?? [])
    .map(mapFile)
    .filter(
      (f) =>
        f.status === "sorting_queue" ||
        (f.confidence != null && f.confidence < 0.7),
    );
}

export async function saveSyncRun(run: SyncRun): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("sync_runs")
    .insert({
      id: run.id,
      started_at: run.started_at,
      finished_at: run.finished_at,
      files_seen: run.files_seen,
      files_processed: run.files_processed,
      files_skipped_unchanged: run.files_skipped_unchanged,
      ai_calls: run.ai_calls,
      stub: run.stub,
      mode: run.mode,
      notes: run.notes,
    });
  assertOk(error, "saveSyncRun");
}

export async function latestSyncRun(): Promise<SyncRun | null> {
  const { data, error } = await getServiceSupabase()
    .from("sync_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(1);
  assertOk(error, "latestSyncRun");
  const row = data?.[0];
  return row ? mapSyncRun(row) : null;
}

async function passageAnchors(
  fileId: string,
): Promise<{ ids: string[]; anchors: Map<string, string> }> {
  const { data, error } = await getServiceSupabase()
    .from("passages")
    .select("id,anchor")
    .eq("file_id", fileId);
  assertOk(error, "passageAnchors");
  const anchors = new Map<string, string>();
  for (const r of data ?? []) anchors.set(r.id, r.anchor ?? "");
  return { ids: [...anchors.keys()], anchors };
}

export async function listHighlightsForFile(
  fileId: string,
): Promise<(Highlight & { passage_anchor: string })[]> {
  const { ids, anchors } = await passageAnchors(fileId);
  const rows: Row[] = [];
  for (const batch of chunk(ids, IN_CHUNK)) {
    const { data, error } = await getServiceSupabase()
      .from("highlights")
      .select("*")
      .in("passage_id", batch);
    assertOk(error, "listHighlightsForFile");
    rows.push(...(data ?? []));
  }
  rows.sort((a, b) => iso(a.created_at).localeCompare(iso(b.created_at)));
  return rows.map((r) => ({
    ...mapHighlight(r),
    passage_anchor: anchors.get(r.passage_id) ?? "",
  }));
}

export async function listCommentsForFile(
  fileId: string,
): Promise<
  (Comment & { passage_anchor: string; person_name: string; team_colour: string | null })[]
> {
  const sb = getServiceSupabase();
  const { ids, anchors } = await passageAnchors(fileId);
  const rows: Row[] = [];
  for (const batch of chunk(ids, IN_CHUNK)) {
    const { data, error } = await sb
      .from("comments")
      .select("*")
      .in("passage_id", batch);
    assertOk(error, "listCommentsForFile");
    rows.push(...(data ?? []));
  }
  rows.sort((a, b) => iso(a.created_at).localeCompare(iso(b.created_at)));

  const personIds = [...new Set(rows.map((r) => r.person_id as string))];
  const people = new Map<string, { name: string; team_id: string | null }>();
  for (const batch of chunk(personIds, IN_CHUNK)) {
    const { data, error } = await sb
      .from("people")
      .select("id,name,team_id")
      .in("id", batch);
    assertOk(error, "listCommentsForFile(people)");
    for (const p of data ?? []) {
      people.set(p.id, { name: p.name, team_id: p.team_id ?? null });
    }
  }
  const { data: teamRows, error: teamErr } = await sb
    .from("teams")
    .select("id,colour");
  assertOk(teamErr, "listCommentsForFile(teams)");
  const colours = new Map<string, string>(
    (teamRows ?? []).map((t) => [t.id as string, t.colour as string]),
  );

  return rows.map((r) => {
    const person = people.get(r.person_id);
    return {
      ...mapComment(r),
      passage_anchor: anchors.get(r.passage_id) ?? "",
      person_name: person?.name ?? "Unknown",
      team_colour: person?.team_id ? (colours.get(person.team_id) ?? null) : null,
    };
  });
}

export async function createHighlight(
  input: Omit<Highlight, "id" | "created_at"> & { id?: string },
): Promise<Highlight> {
  const { data, error } = await getServiceSupabase()
    .from("highlights")
    .insert({
      id: input.id ?? randomUUID(),
      passage_id: input.passage_id,
      range: input.range,
      person_id: input.person_id,
      body: input.body,
      thread_id: input.thread_id,
      created_at: nowIso(),
      created_by: input.created_by,
    })
    .select("*")
    .single();
  assertOk(error, "createHighlight");
  return mapHighlight(data as Row);
}

export async function createComment(
  input: Omit<Comment, "id" | "created_at"> & { id?: string },
): Promise<Comment> {
  const { data, error } = await getServiceSupabase()
    .from("comments")
    .insert({
      id: input.id ?? randomUUID(),
      passage_id: input.passage_id,
      range: input.range,
      person_id: input.person_id,
      body: input.body,
      thread_id: input.thread_id,
      created_at: nowIso(),
      created_by: input.created_by,
    })
    .select("*")
    .single();
  assertOk(error, "createComment");
  return mapComment(data as Row);
}

export async function saveFlashcard(card: Flashcard): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("flashcards")
    .upsert(
      {
        id: card.id,
        team_id: card.team_id,
        case_id: card.case_id,
        deck: card.deck,
        front: card.front,
        back: card.back,
        citation_ids: card.citation_ids,
        truth_item_id: card.truth_item_id,
        claim_id: card.claim_id,
        source_kind: card.source_kind,
        created_at: card.created_at,
        created_by: card.created_by,
        updated_at: card.updated_at,
      },
      { onConflict: "id" },
    );
  assertOk(error, "saveFlashcard");
}

export async function saveResearchRun(run: ResearchRun): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("research_runs")
    .insert({
      id: run.id,
      case_id: run.case_id,
      gaps: run.gaps,
      findings: run.findings,
      claim_dossiers: run.claim_dossiers ?? null,
      brief: run.brief ?? null,
      stub: run.stub,
      created_at: run.created_at,
      created_by: run.created_by,
    });
  assertOk(error, "saveResearchRun");
}

export async function listResearchRuns(limit = 50): Promise<ResearchRun[]> {
  const { data, error } = await getServiceSupabase()
    .from("research_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  assertOk(error, "listResearchRuns");
  return (data ?? []).map(mapResearchRun);
}

export async function saveBookRequest(req: BookRequest): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("book_requests")
    .upsert(
      {
        id: req.id,
        title: req.title,
        reason: req.reason,
        chapter: req.chapter,
        case_id: req.case_id,
        status: req.status,
        upload_path: req.upload_path ?? null,
        library_file_id: req.library_file_id ?? null,
        created_at: req.created_at,
        created_by: req.created_by,
      },
      { onConflict: "id" },
    );
  assertOk(error, "saveBookRequest");
}

export async function listBookRequests(): Promise<BookRequest[]> {
  const { data, error } = await getServiceSupabase()
    .from("book_requests")
    .select("*")
    .order("created_at", { ascending: true });
  assertOk(error, "listBookRequests");
  return (data ?? []).map(mapBookRequest);
}

export async function updateBookRequestStatus(
  id: string,
  status: BookRequest["status"],
): Promise<BookRequest | null> {
  const { data, error } = await getServiceSupabase()
    .from("book_requests")
    .update({ status })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  assertOk(error, "updateBookRequestStatus");
  return data ? mapBookRequest(data) : null;
}

type SearchFileRef = {
  id: string;
  name: string | null;
  drive_id: string | null;
  type: string | null;
  case_numbers: number[] | null;
};

export async function searchLibrary(input: {
  q: string;
  caseNumber?: number | null;
  teamId?: string | null;
  type?: string | null;
  limit?: number;
}): Promise<SearchHit[]> {
  const sb = getServiceSupabase();
  const q = input.q.trim().toLowerCase();
  if (!q) return [];
  const queryVec = stubEmbed(q);
  const hits: SearchHit[] = [];

  for (let from = 0; from < SEARCH_MAX_SCAN; from += SEARCH_PAGE) {
    let query = sb
      .from("passages")
      .select(
        "id,file_id,drive_id,anchor,text,embedding,files!inner(id,name,drive_id,type,case_numbers)",
      )
      .order("id", { ascending: true })
      .range(from, from + SEARCH_PAGE - 1);
    if (input.caseNumber != null) {
      query = query.contains("files.case_numbers", [input.caseNumber]);
    }
    if (input.type) query = query.eq("files.type", input.type);
    const { data, error } = await query;
    assertOk(error, "searchLibrary(passages)");
    const rows = (data ?? []) as Row[];

    for (const row of rows) {
      const file = (
        Array.isArray(row.files) ? row.files[0] : row.files
      ) as SearchFileRef | undefined;
      if (!file) continue;
      const text: string = row.text ?? "";
      const emb = parseEmbedding(row.embedding) ?? stubEmbed(text);
      const semantic = cosine(queryVec, emb);
      const keyword = text.toLowerCase().includes(q) ? 0.35 : 0;
      const score = semantic + keyword;
      if (score < 0.15 && keyword === 0) continue;
      hits.push({
        kind: file.type === "practice_transcript" ? "transcript" : "passage",
        id: row.id,
        file_id: file.id,
        drive_id: row.drive_id ?? file.drive_id,
        anchor: row.anchor ?? null,
        title: file.name ?? "",
        snippet: text.slice(0, 220),
        score,
        case_numbers: file.case_numbers ?? [],
        team_id: null,
        type: file.type,
      });
    }
    if (rows.length < SEARCH_PAGE) break;
  }

  const { data: commentRows, error: commentErr } = await sb
    .from("comments")
    .select("id,passage_id,person_id,body")
    .ilike("body", `%${likeEscape(q)}%`)
    .limit(500);
  assertOk(commentErr, "searchLibrary(comments)");
  const comments = (commentRows ?? []) as Row[];

  if (comments.length > 0) {
    const personIds = [...new Set(comments.map((c) => c.person_id as string))];
    const personTeam = new Map<string, string | null>();
    for (const batch of chunk(personIds, IN_CHUNK)) {
      const { data, error } = await sb
        .from("people")
        .select("id,team_id")
        .in("id", batch);
      assertOk(error, "searchLibrary(people)");
      for (const p of data ?? []) personTeam.set(p.id, p.team_id ?? null);
    }

    const passageIds = [
      ...new Set(
        comments.map((c) => c.passage_id as string).filter((id) => Boolean(id)),
      ),
    ];
    const passageMap = new Map<string, { anchor: string | null; file_id: string | null }>();
    for (const batch of chunk(passageIds, IN_CHUNK)) {
      const { data, error } = await sb
        .from("passages")
        .select("id,anchor,file_id")
        .in("id", batch);
      assertOk(error, "searchLibrary(comment passages)");
      for (const p of data ?? []) {
        passageMap.set(p.id, { anchor: p.anchor ?? null, file_id: p.file_id ?? null });
      }
    }

    const fileIds = [
      ...new Set(
        [...passageMap.values()]
          .map((p) => p.file_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const fileMap = new Map<string, SearchFileRef>();
    for (const batch of chunk(fileIds, IN_CHUNK)) {
      const { data, error } = await sb
        .from("files")
        .select("id,name,drive_id,type,case_numbers")
        .in("id", batch);
      assertOk(error, "searchLibrary(comment files)");
      for (const f of (data ?? []) as SearchFileRef[]) fileMap.set(f.id, f);
    }

    for (const comment of comments) {
      const teamId = personTeam.get(comment.person_id) ?? null;
      if (input.teamId && teamId !== input.teamId) continue;
      const passage = passageMap.get(comment.passage_id);
      const file = passage?.file_id ? fileMap.get(passage.file_id) : undefined;
      if (
        input.caseNumber != null &&
        file &&
        !(file.case_numbers ?? []).includes(input.caseNumber)
      ) {
        continue;
      }
      const body: string = comment.body ?? "";
      hits.push({
        kind: "comment",
        id: comment.id,
        file_id: file?.id ?? null,
        drive_id: file?.drive_id ?? null,
        anchor: passage?.anchor ?? null,
        title: file?.name ?? "Comment",
        snippet: body.slice(0, 220),
        score: 0.7,
        case_numbers: file?.case_numbers ?? [],
        team_id: teamId,
        type: "comment",
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, input.limit ?? 40);
}

export async function countAiCallsSince(sinceIso: string): Promise<number> {
  const { count, error } = await getServiceSupabase()
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("refused", false)
    .gte("created_at", new Date(sinceIso).toISOString());
  assertOk(error, "countAiCallsSince");
  return count ?? 0;
}
