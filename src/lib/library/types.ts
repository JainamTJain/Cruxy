/** Track 1 Library / Research domain types. */

export type LibraryFileType =
  | "case_set"
  | "practice_transcript"
  | "team_notes"
  | "rules"
  | "research"
  | "coach_guidance"
  | "general";

export type LibraryFileStatus =
  | "pending"
  | "digested"
  | "sorting_queue"
  | "error";

export interface LibraryFile {
  id: string;
  drive_id: string | null;
  name: string;
  path: string | null;
  mime: string | null;
  modified_at: string | null;
  checksum: string | null;
  case_ids: string[];
  case_numbers: number[];
  type: LibraryFileType | null;
  confidence: number | null;
  card: string | null;
  text_content: string | null;
  scanned_pdf: boolean;
  /** Why text could not be extracted; null when readable (Wave 7). */
  unreadable_reason: string | null;
  status: LibraryFileStatus;
  /** Ideas extracted during digest (transcript → proposals). */
  extracted_ideas: string[];
  created_at: string;
  created_by: string | null;
}

export interface Passage {
  id: string;
  file_id: string;
  drive_id: string | null;
  anchor: string;
  text: string;
  embedding: number[] | null;
  /** True when the vector is a local stub (gateway refused / missing). */
  embedding_stub?: boolean;
  ord: number;
  created_at: string;
  created_by: string | null;
}

export interface Highlight {
  id: string;
  passage_id: string;
  range: string;
  person_id: string;
  body: string | null;
  thread_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Comment {
  id: string;
  passage_id: string;
  range: string | null;
  person_id: string;
  body: string;
  thread_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ResearchGap {
  kind: "unsupported_support" | "unverified_fact" | "unanswered_counter" | "unanswered_moderator";
  claim_ref: string;
  detail: string;
}

export interface ResearchFinding {
  id: string;
  point: string;
  why_it_matters: string;
  claim_ref: string;
  quote: string;
  link: string;
  verified: boolean;
  needs_check: boolean;
  source_ids: string[];
  /** Bibliographic fields (Wave 7). */
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  doi?: string | null;
  licence?: string | null;
  open_access?: boolean | null;
  citation?: string | null;
}

export interface ResearchRun {
  id: string;
  case_id: string;
  gaps: ResearchGap[];
  findings: ResearchFinding[];
  stub: boolean;
  created_at: string;
  created_by: string | null;
}

export type BookRequestStatus = "open" | "fulfilled" | "dismissed";

export interface BookRequest {
  id: string;
  title: string;
  reason: string | null;
  chapter: string | null;
  case_id: string | null;
  status: BookRequestStatus;
  /** Supabase storage path under crux-uploads (F-105). */
  upload_path?: string | null;
  /** Digested library file id after Jainam uploads a PDF. */
  library_file_id?: string | null;
  created_at: string;
  created_by: string | null;
}

/** Proposals live in case-brain types (shared Evidence Library queue). */

/** Shared with Track 3 Revision (FSRS + Truth Source sync). */
export interface Flashcard {
  id: string;
  team_id: string | null;
  case_id: string | null;
  deck: string;
  front: string;
  back: string;
  citation_ids: string[];
  truth_item_id: string | null;
  /** Claim-map node this card drills (Wave 6 graph-aware flashcards). */
  claim_id: string | null;
  source_kind: "truth" | "reading" | "case_card" | "manual";
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  files_seen: number;
  files_processed: number;
  files_skipped_unchanged: number;
  ai_calls: number;
  stub: boolean;
  mode: "manual" | "cron" | "sample";
  notes: string | null;
}

export interface DriveListedFile {
  drive_id: string;
  name: string;
  path: string;
  mime: string;
  modified_at: string;
  checksum: string;
  /** Pre-extracted text when listing from sample stubs. */
  text_content?: string;
}

export const SORTING_CONFIDENCE_THRESHOLD = 0.7;
export const PASSAGE_TARGET_WORDS = 600;
/** Matches passages.embedding vector(1536) and openai/text-embedding-3-small. */
export const EMBEDDING_DIM = 1536;
