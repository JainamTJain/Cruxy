import "server-only";

import { isSampleDataMode } from "@/lib/db/config";
import { listLibraryFiles } from "@/lib/db/library-repository";
import { listCases, listPeopleFull, listTeams } from "@/lib/db/repository";
import { readStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { searchLibraryUnified } from "@/lib/db/supabase/library-search-extra";
import { listSegmentsForCase } from "@/lib/db/supabase/file-segments";
import { listFlashcards, listQuestions } from "@/lib/revision/repository";
import { listConversationsForPerson } from "@/lib/team/chat-conversations";
import { listMessages } from "@/lib/team/repository";
import {
  SEARCH_KIND_LABEL,
  type GlobalSearchGroup,
  type GlobalSearchHit,
  type SearchKind,
} from "@/lib/search/types";

function clip(text: string, n = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

function scoreText(q: string, title: string, body: string): number {
  const needle = q.toLowerCase();
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  if (t === needle) return 1;
  if (t.startsWith(needle)) return 0.92;
  if (t.includes(needle)) return 0.8;
  if (b.includes(needle)) return 0.55;
  const parts = needle.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 0;
  const hits = parts.filter((p) => t.includes(p) || b.includes(p)).length;
  return hits === 0 ? 0 : 0.35 + (hits / parts.length) * 0.3;
}

function groupHits(hits: GlobalSearchHit[]): GlobalSearchGroup[] {
  const order: SearchKind[] = [
    "case",
    "brief",
    "evidence",
    "segment",
    "flashcard",
    "question",
    "chat",
    "passage",
  ];
  const by = new Map<SearchKind, GlobalSearchHit[]>();
  for (const h of hits) {
    (by.get(h.kind) ?? by.set(h.kind, []).get(h.kind)!).push(h);
  }
  return order
    .filter((k) => (by.get(k)?.length ?? 0) > 0)
    .map((kind) => ({
      kind,
      label: SEARCH_KIND_LABEL[kind],
      hits: (by.get(kind) ?? []).slice(0, 8),
    }));
}

async function searchFts(
  q: string,
  opts: { teamId: string | null; limit: number },
): Promise<GlobalSearchHit[]> {
  if (isSampleDataMode()) return [];
  const sb = getServiceSupabase();
  // Chat rows are never served from FTS alone: live scan uses
  // listConversationsForPerson so Leads-only stays leads-only.
  const { data, error } = await sb
    .from("search_documents")
    .select("id,kind,title,body,href,case_id,team_id,source_id")
    .textSearch("search_tsv", q, { type: "websearch", config: "english" })
    .neq("kind", "chat")
    .or(
      opts.teamId
        ? `team_id.is.null,team_id.eq.${opts.teamId}`
        : "team_id.is.null",
    )
    .limit(opts.limit);
  if (error) {
    // Table may not exist yet on a fresh preview.
    return [];
  }
  return (data ?? []).map((r) => ({
    kind: r.kind as SearchKind,
    id: r.source_id ?? r.id,
    title: r.title,
    snippet: clip(r.body),
    href: r.href,
    score: 0.75,
    case_id: r.case_id ?? null,
    case_number: null,
    team_id: r.team_id ?? null,
  }));
}

/** Chat ids the viewer may open (same rule as /api/team/chat). */
async function visibleChatIds(input: {
  personId: string;
  teamId: string;
  isAdmin: boolean;
}): Promise<Set<string>> {
  const payload = await listConversationsForPerson({
    personId: input.personId,
    teamId: input.teamId,
    isAdmin: input.isAdmin,
  });
  return new Set(payload.conversations.map((c) => c.id));
}

async function searchSampleAndLiveScan(input: {
  q: string;
  teamId: string;
  personId: string;
  isAdmin: boolean;
  limit: number;
}): Promise<GlobalSearchHit[]> {
  const q = input.q.trim();
  const hits: GlobalSearchHit[] = [];
  const cases = await listCases();
  const caseById = new Map(cases.map((c) => [c.id, c]));

  for (const c of cases.filter((c) => c.active)) {
    const body = [c.crux, c.trap, c.closing_question, c.title]
      .filter(Boolean)
      .join(" ");
    const score = scoreText(q, `Case ${c.number} ${c.title}`, body);
    if (score > 0) {
      hits.push({
        kind: "case",
        id: c.id,
        title: `Case ${c.number}: ${c.title}`,
        snippet: clip(c.crux ?? c.closing_question ?? body),
        href: `/case-brain/${c.id}?tab=case`,
        score,
        case_id: c.id,
        case_number: c.number,
        team_id: null,
      });
    }
  }

  // Evidence + briefs from sample store or light queries
  if (isSampleDataMode()) {
    const store = await readStore();
    for (const t of store.truth_items.filter((x) => x.status === "accepted")) {
      if (!input.isAdmin && t.team_id !== input.teamId) continue;
      const score = scoreText(q, t.kind, t.text);
      if (score <= 0) continue;
      const c = caseById.get(t.case_id);
      hits.push({
        kind: "evidence",
        id: t.id,
        title: c ? `Evidence, Case ${c.number}` : "Evidence",
        snippet: clip(t.text),
        href: `/case-brain/${t.case_id}?tab=truth`,
        score,
        case_id: t.case_id,
        case_number: c?.number ?? null,
        team_id: t.team_id,
      });
    }
    const allowedChatIds = await visibleChatIds({
      personId: input.personId,
      teamId: input.teamId,
      isAdmin: input.isAdmin,
    });
    for (const m of store.messages ?? []) {
      if (!allowedChatIds.has(m.chat_id)) continue;
      const score = scoreText(q, "Chat", m.body);
      if (score <= 0) continue;
      hits.push({
        kind: "chat",
        id: m.id,
        title: "Team chat",
        snippet: clip(m.body),
        href: `/team/chat?chatId=${encodeURIComponent(m.chat_id)}&jump=${encodeURIComponent(m.id)}`,
        score: score * 0.9,
        case_id: m.case_id,
        case_number: m.case_id ? caseById.get(m.case_id)?.number ?? null : null,
        team_id: input.teamId,
      });
    }
  } else {
    const sb = getServiceSupabase();
    let truthQuery = sb
      .from("truth_items")
      .select("id,text,kind,case_id,team_id,status")
      .eq("status", "accepted")
      .ilike("text", `%${q}%`)
      .limit(20);
    if (!input.isAdmin) {
      truthQuery = truthQuery.eq("team_id", input.teamId);
    }
    const { data: truth } = await truthQuery;
    for (const t of truth ?? []) {
      const c = caseById.get(t.case_id);
      hits.push({
        kind: "evidence",
        id: t.id,
        title: c ? `Evidence, Case ${c.number}` : "Evidence",
        snippet: clip(t.text ?? ""),
        href: `/case-brain/${t.case_id}?tab=truth`,
        score: 0.6,
        case_id: t.case_id,
        case_number: c?.number ?? null,
        team_id: t.team_id,
      });
    }
    const allowedChatIds = await visibleChatIds({
      personId: input.personId,
      teamId: input.teamId,
      isAdmin: input.isAdmin,
    });
    // Cap chats and recent messages so Cmd K stays usable on Dec 5 wifi.
    const chatIdList = [...allowedChatIds].slice(0, 12);
    for (const chatId of chatIdList) {
      const msgs = (await listMessages(chatId)).slice(-40);
      for (const m of msgs) {
        const score = scoreText(q, "Chat", m.body);
        if (score <= 0) continue;
        hits.push({
          kind: "chat",
          id: m.id,
          title: "Team chat",
          snippet: clip(m.body),
          href: `/team/chat?chatId=${encodeURIComponent(chatId)}&jump=${encodeURIComponent(m.id)}`,
          score: score * 0.9,
          case_id: m.case_id,
          case_number: m.case_id
            ? caseById.get(m.case_id)?.number ?? null
            : null,
          team_id: input.teamId,
        });
      }
    }
    const { data: briefs } = await sb
      .from("team_briefs")
      .select("id,case_id,team_id,mode,thesis")
      .or(`team_id.eq.${input.teamId}`)
      .limit(40);
    for (const b of briefs ?? []) {
      const thesis = (b as { thesis?: string | null }).thesis ?? "";
      const c = caseById.get(b.case_id);
      const score = scoreText(
        q,
        `Team Brief ${c?.number ?? ""}`,
        `${thesis} ${b.mode}`,
      );
      if (score <= 0 && !String(b.mode).includes(q.toLowerCase())) continue;
      hits.push({
        kind: "brief",
        id: b.id,
        title: c ? `Team Brief, Case ${c.number}` : "Team Brief",
        snippet: clip(thesis || `Mode: ${b.mode}`),
        href: `/case-brain/${b.case_id}?tab=brief`,
        score: Math.max(score, 0.4),
        case_id: b.case_id,
        case_number: c?.number ?? null,
        team_id: b.team_id,
      });
    }
  }

  // Flashcards + questions for viewer's team cases
  const cards = await listFlashcards({ teamId: input.teamId });
  for (const card of cards) {
    const score = scoreText(q, card.front, card.back);
    if (score <= 0) continue;
    const c = card.case_id ? caseById.get(card.case_id) : undefined;
    hits.push({
      kind: "flashcard",
      id: card.id,
      title: c ? `Flashcard, Case ${c.number}` : "Flashcard",
      snippet: clip(card.front),
      href: card.case_id
        ? `/revision/flashcards?caseId=${card.case_id}`
        : "/revision/flashcards",
      score,
      case_id: card.case_id,
      case_number: c?.number ?? null,
      team_id: card.team_id,
    });
  }

  const questions = await listQuestions({});
  for (const qq of questions.filter((x) => x.status === "active")) {
    const score = scoreText(q, qq.text, qq.origin_label ?? "");
    if (score <= 0) continue;
    const c = caseById.get(qq.case_id);
    hits.push({
      kind: "question",
      id: qq.id,
      title: c ? `Question, Case ${c.number}` : "Question",
      snippet: clip(qq.text),
      href: `/revision/questions?caseId=${qq.case_id}`,
      score,
      case_id: qq.case_id,
      case_number: c?.number ?? null,
      team_id: null,
    });
  }

  // Library segments for active cases (short)
  const files = await listLibraryFiles();
  for (const c of cases.filter((x) => x.active).slice(0, 12)) {
    const segs = await listSegmentsForCase(c.id);
    for (const s of segs.slice(0, 20)) {
      const score = scoreText(q, s.title, s.body);
      if (score <= 0) continue;
      const file = files.find((f) => f.id === s.file_id);
      hits.push({
        kind: "segment",
        id: s.id,
        title: file?.name ?? s.title,
        snippet: clip(s.body),
        href: `/case-brain/${c.id}?tab=readings&file=${s.file_id}`,
        score,
        case_id: c.id,
        case_number: c.number,
        team_id: null,
      });
    }
  }

  // Sample mode Team Briefs (if table mirrored on store)
  if (isSampleDataMode()) {
    const store = await readStore();
    const briefs = (store as { team_briefs?: Array<{
      id: string;
      case_id: string;
      team_id: string;
      mode: string;
      thesis?: string | null;
    }> }).team_briefs;
    for (const b of briefs ?? []) {
      if (b.team_id !== input.teamId) continue;
      const c = caseById.get(b.case_id);
      const score = scoreText(q, "Team Brief", b.thesis ?? b.mode);
      if (score <= 0) continue;
      hits.push({
        kind: "brief",
        id: b.id,
        title: c ? `Team Brief, Case ${c.number}` : "Team Brief",
        snippet: clip(b.thesis ?? b.mode),
        href: `/case-brain/${b.case_id}?tab=brief`,
        score,
        case_id: b.case_id,
        case_number: c?.number ?? null,
        team_id: b.team_id,
      });
    }
  }

  void listTeams;
  void listPeopleFull;
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}

/** Global search: FTS index + live scan + library embeddings. */
export async function searchGlobal(input: {
  q: string;
  teamId: string;
  personId: string;
  isAdmin?: boolean;
  limit?: number;
}): Promise<{ groups: GlobalSearchGroup[]; took_ms: number }> {
  const started = Date.now();
  const q = input.q.trim();
  if (q.length < 2) {
    return { groups: [], took_ms: Date.now() - started };
  }
  const limit = input.limit ?? 40;
  const isAdmin = Boolean(input.isAdmin);

  const [fts, scan, library] = await Promise.all([
    searchFts(q, { teamId: input.teamId, limit }),
    searchSampleAndLiveScan({
      q,
      teamId: input.teamId,
      personId: input.personId,
      isAdmin,
      limit,
    }),
    searchLibraryUnified({
      q,
      teamId: input.teamId,
      personId: input.personId,
      limit: 12,
    }),
  ]);

  const byKey = new Map<string, GlobalSearchHit>();
  for (const h of [...fts, ...scan]) {
    const key = `${h.kind}:${h.id}`;
    const prev = byKey.get(key);
    if (!prev || h.score > prev.score) byKey.set(key, h);
  }
  for (const h of library) {
    const kind: SearchKind =
      h.kind === "truth" ? "evidence" : h.kind === "comment" ? "passage" : "passage";
    const key = `${kind}:${h.id}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      kind,
      id: h.id,
      title: h.title,
      snippet: clip(h.snippet),
      href: h.file_id
        ? `/library/${h.file_id}`
        : h.case_numbers[0]
          ? `/case-brain` // fallback
          : "/library/search",
      score: h.score * 0.85,
      case_id: null,
      case_number: h.case_numbers[0] ?? null,
      team_id: h.team_id,
    });
  }

  const hits = [...byKey.values()].sort((a, b) => b.score - a.score);
  return { groups: groupHits(hits), took_ms: Date.now() - started };
}

/** Rebuild FTS rows for common sources (cron / admin). Best-effort. */
export async function rebuildSearchIndex(): Promise<{ upserted: number }> {
  if (isSampleDataMode()) return { upserted: 0 };
  const sb = getServiceSupabase();
  const cases = await listCases();
  let upserted = 0;
  const rows: Record<string, unknown>[] = [];
  for (const c of cases.filter((x) => x.active)) {
    rows.push({
      kind: "case",
      title: `Case ${c.number}: ${c.title}`,
      body: [c.crux, c.trap, c.closing_question].filter(Boolean).join("\n"),
      href: `/case-brain/${c.id}?tab=case`,
      case_id: c.id,
      team_id: null,
      source_id: `case:${c.id}`,
      updated_at: new Date().toISOString(),
    });
  }
  const questions = await listQuestions({});
  for (const qq of questions.filter((x) => x.status === "active")) {
    rows.push({
      kind: "question",
      title: "Question",
      body: qq.text,
      href: `/revision/questions?caseId=${qq.case_id}`,
      case_id: qq.case_id,
      team_id: null,
      source_id: `question:${qq.id}`,
      updated_at: new Date().toISOString(),
    });
  }
  for (const batch of chunk(rows, 100)) {
    const { error } = await sb.from("search_documents").upsert(batch, {
      onConflict: "kind,source_id",
    });
    if (!error) upserted += batch.length;
  }
  return { upserted };
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
