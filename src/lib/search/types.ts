export type SearchKind =
  | "case"
  | "brief"
  | "evidence"
  | "segment"
  | "flashcard"
  | "question"
  | "chat"
  | "passage";

export type GlobalSearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  href: string;
  score: number;
  case_id: string | null;
  case_number: number | null;
  team_id: string | null;
};

export type GlobalSearchGroup = {
  kind: SearchKind;
  label: string;
  hits: GlobalSearchHit[];
};

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  case: "Cases",
  brief: "Team Briefs",
  evidence: "Evidence Library",
  segment: "Library",
  flashcard: "Flashcards",
  question: "Questions",
  chat: "Chat",
  passage: "Passages",
};
