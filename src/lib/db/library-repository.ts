import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { cosine } from "@/lib/library/embeddings";
import { stubEmbed } from "@/lib/library/embeddings";
import type {
  BookRequest,
  Comment,
  Flashcard,
  Highlight,
  LibraryFile,
  Passage,
  ResearchRun,
  SyncRun,
} from "@/lib/library/types";
import type { CaseRow, Team } from "@/lib/types";
import { nowIso } from "@/lib/utils";

function requireSample() {
  if (!isSampleDataMode()) {
    throw new Error("Supabase path not wired yet — set USE_SAMPLE_DATA=1");
  }
}

export async function listCases(): Promise<CaseRow[]> {
  requireSample();
  const store = await readStore();
  return store.cases;
}

export async function listTeams(): Promise<Team[]> {
  requireSample();
  const store = await readStore();
  return store.teams;
}

export async function listLibraryFiles(): Promise<LibraryFile[]> {
  requireSample();
  const store = await readStore();
  return store.files;
}

export async function getLibraryFile(id: string): Promise<LibraryFile | null> {
  requireSample();
  const store = await readStore();
  return store.files.find((f) => f.id === id) ?? null;
}

export async function getLibraryFileByDriveId(
  driveId: string,
): Promise<LibraryFile | null> {
  requireSample();
  const store = await readStore();
  return store.files.find((f) => f.drive_id === driveId) ?? null;
}

export async function saveLibraryFile(file: LibraryFile): Promise<void> {
  requireSample();
  await updateStore((s) => {
    const i = s.files.findIndex((f) => f.id === file.id);
    if (i >= 0) s.files[i] = file;
    else s.files.push(file);
  });
}

export async function replaceFilePassages(
  fileId: string,
  passages: Passage[],
): Promise<void> {
  requireSample();
  await updateStore((s) => {
    s.passages = s.passages.filter((p) => p.file_id !== fileId);
    s.passages.push(...passages);
  });
}

export async function listPassagesForFile(fileId: string): Promise<Passage[]> {
  requireSample();
  const store = await readStore();
  return store.passages
    .filter((p) => p.file_id === fileId)
    .sort((a, b) => a.ord - b.ord);
}

export async function getPassage(id: string): Promise<Passage | null> {
  requireSample();
  const store = await readStore();
  return store.passages.find((p) => p.id === id) ?? null;
}

export async function listSortingQueue(): Promise<LibraryFile[]> {
  requireSample();
  const store = await readStore();
  return store.files.filter(
    (f) =>
      f.status === "sorting_queue" ||
      (f.confidence != null && f.confidence < 0.7),
  );
}

export async function saveSyncRun(run: SyncRun): Promise<void> {
  requireSample();
  await updateStore((s) => {
    s.sync_runs.unshift(run);
  });
}

export async function latestSyncRun(): Promise<SyncRun | null> {
  requireSample();
  const store = await readStore();
  return store.sync_runs[0] ?? null;
}

export async function listHighlightsForFile(
  fileId: string,
): Promise<(Highlight & { passage_anchor: string })[]> {
  requireSample();
  const store = await readStore();
  const passageIds = new Set(
    store.passages.filter((p) => p.file_id === fileId).map((p) => p.id),
  );
  return store.highlights
    .filter((h) => passageIds.has(h.passage_id))
    .map((h) => ({
      ...h,
      passage_anchor:
        store.passages.find((p) => p.id === h.passage_id)?.anchor ?? "",
    }));
}

export async function listCommentsForFile(
  fileId: string,
): Promise<
  (Comment & { passage_anchor: string; person_name: string; team_colour: string | null })[]
> {
  requireSample();
  const store = await readStore();
  const passageIds = new Set(
    store.passages.filter((p) => p.file_id === fileId).map((p) => p.id),
  );
  return store.comments
    .filter((c) => passageIds.has(c.passage_id))
    .map((c) => {
      const person = store.people.find((p) => p.id === c.person_id);
      const team = store.teams.find((t) => t.id === person?.team_id);
      return {
        ...c,
        passage_anchor:
          store.passages.find((p) => p.id === c.passage_id)?.anchor ?? "",
        person_name: person?.name ?? "Unknown",
        team_colour: team?.colour ?? null,
      };
    });
}

export async function createHighlight(
  input: Omit<Highlight, "id" | "created_at"> & { id?: string },
): Promise<Highlight> {
  requireSample();
  const row: Highlight = {
    id: input.id ?? randomUUID(),
    passage_id: input.passage_id,
    range: input.range,
    person_id: input.person_id,
    body: input.body,
    thread_id: input.thread_id,
    created_at: nowIso(),
    created_by: input.created_by,
  };
  await updateStore((s) => {
    s.highlights.push(row);
  });
  return row;
}

export async function createComment(
  input: Omit<Comment, "id" | "created_at"> & { id?: string },
): Promise<Comment> {
  requireSample();
  const row: Comment = {
    id: input.id ?? randomUUID(),
    passage_id: input.passage_id,
    range: input.range,
    person_id: input.person_id,
    body: input.body,
    thread_id: input.thread_id,
    created_at: nowIso(),
    created_by: input.created_by,
  };
  await updateStore((s) => {
    s.comments.push(row);
  });
  return row;
}

export async function saveFlashcard(card: Flashcard): Promise<void> {
  requireSample();
  await updateStore((s) => {
    s.flashcards.push(card);
  });
}

export async function saveResearchRun(run: ResearchRun): Promise<void> {
  requireSample();
  await updateStore((s) => {
    s.research_runs.unshift(run);
  });
}

export async function listResearchRuns(limit = 50): Promise<ResearchRun[]> {
  requireSample();
  const store = await readStore();
  return store.research_runs.slice(0, limit);
}

export async function saveBookRequest(req: BookRequest): Promise<void> {
  requireSample();
  await updateStore((s) => {
    const i = s.book_requests.findIndex((b) => b.id === req.id);
    if (i >= 0) s.book_requests[i] = req;
    else s.book_requests.push(req);
  });
}

export async function listBookRequests(): Promise<BookRequest[]> {
  requireSample();
  const store = await readStore();
  return store.book_requests;
}

export async function updateBookRequestStatus(
  id: string,
  status: BookRequest["status"],
): Promise<BookRequest | null> {
  requireSample();
  let updated: BookRequest | null = null;
  await updateStore((s) => {
    const row = s.book_requests.find((b) => b.id === id);
    if (row) {
      row.status = status;
      updated = row;
    }
  });
  return updated;
}

export type SearchHit = {
  kind: "passage" | "comment" | "truth" | "transcript";
  id: string;
  file_id: string | null;
  drive_id: string | null;
  anchor: string | null;
  title: string;
  snippet: string;
  score: number;
  case_numbers: number[];
  team_id: string | null;
  type: string | null;
};

export async function searchLibrary(input: {
  q: string;
  caseNumber?: number | null;
  teamId?: string | null;
  type?: string | null;
  limit?: number;
}): Promise<SearchHit[]> {
  requireSample();
  const store = await readStore();
  const q = input.q.trim().toLowerCase();
  if (!q) return [];
  const queryVec = stubEmbed(q);
  const hits: SearchHit[] = [];

  for (const passage of store.passages) {
    const file = store.files.find((f) => f.id === passage.file_id);
    if (!file) continue;
    if (
      input.caseNumber != null &&
      !file.case_numbers.includes(input.caseNumber)
    ) {
      continue;
    }
    if (input.type && file.type !== input.type) continue;

    const emb = passage.embedding ?? stubEmbed(passage.text);
    const semantic = cosine(queryVec, emb);
    const keyword = passage.text.toLowerCase().includes(q) ? 0.35 : 0;
    const score = semantic + keyword;
    if (score < 0.15 && keyword === 0) continue;
    hits.push({
      kind:
        file.type === "practice_transcript" ? "transcript" : "passage",
      id: passage.id,
      file_id: file.id,
      drive_id: passage.drive_id ?? file.drive_id,
      anchor: passage.anchor,
      title: file.name,
      snippet: passage.text.slice(0, 220),
      score,
      case_numbers: file.case_numbers,
      team_id: null,
      type: file.type,
    });
  }

  for (const comment of store.comments) {
    if (input.teamId) {
      const person = store.people.find((p) => p.id === comment.person_id);
      if (person?.team_id !== input.teamId) continue;
    }
    if (!comment.body.toLowerCase().includes(q)) continue;
    const passage = store.passages.find((p) => p.id === comment.passage_id);
    const file = store.files.find((f) => f.id === passage?.file_id);
    if (
      input.caseNumber != null &&
      file &&
      !file.case_numbers.includes(input.caseNumber)
    ) {
      continue;
    }
    hits.push({
      kind: "comment",
      id: comment.id,
      file_id: file?.id ?? null,
      drive_id: file?.drive_id ?? null,
      anchor: passage?.anchor ?? null,
      title: file?.name ?? "Comment",
      snippet: comment.body.slice(0, 220),
      score: 0.7,
      case_numbers: file?.case_numbers ?? [],
      team_id:
        store.people.find((p) => p.id === comment.person_id)?.team_id ?? null,
      type: "comment",
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, input.limit ?? 40);
}

export async function countAiCallsSince(iso: string): Promise<number> {
  requireSample();
  const store = await readStore();
  const t = new Date(iso).getTime();
  return store.ai_calls.filter(
    (c) => !c.refused && new Date(c.created_at).getTime() >= t,
  ).length;
}
