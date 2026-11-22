import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { getServiceSupabase, assertOk } from "@/lib/db/supabase/client";
import { searchLibraryWithEmbed } from "@/lib/db/supabase/library-extra";
import { searchLibrary } from "@/lib/db/library-repository";

export type UnifiedSearchHit = {
  kind: "passage" | "comment" | "truth" | "transcript";
  id: string;
  file_id: string | null;
  drive_id: string | null;
  anchor: string | null;
  title: string;
  snippet: string;
  score: number;
  case_numbers: number[];
  type: string | null;
  team_id: string | null;
};

/**
 * F-092: search passages (embed), comments, Truth Sources, and
 * practice-transcript file cards with case / team / type filters.
 */
export async function searchLibraryUnified(input: {
  q: string;
  caseNumber?: number;
  type?: string;
  teamId?: string;
  personId?: string | null;
  limit?: number;
}): Promise<UnifiedSearchHit[]> {
  const q = input.q.trim();
  if (!q) return [];
  const limit = input.limit ?? 30;
  const lower = q.toLowerCase();

  const [embedHits, keywordHits] = await Promise.all([
    searchLibraryWithEmbed({
      q,
      caseNumber: input.caseNumber,
      type: input.type,
      personId: input.personId,
      limit,
    }),
    searchLibrary({
      q,
      caseNumber: input.caseNumber,
      type: input.type,
      teamId: input.teamId,
      limit,
    }),
  ]);

  const byKey = new Map<string, UnifiedSearchHit>();

  for (const h of embedHits) {
    const key = `passage:${h.passage_id}`;
    byKey.set(key, {
      kind:
        input.type === "practice_transcript" ? "transcript" : "passage",
      id: h.passage_id,
      file_id: h.file_id,
      drive_id: h.drive_id,
      anchor: h.anchor,
      title: h.file_name,
      snippet: h.text,
      score: h.score,
      case_numbers: [],
      type: input.type ?? null,
      team_id: null,
    });
  }

  for (const h of keywordHits) {
    const key = `${h.kind}:${h.id}`;
    const existing = byKey.get(key);
    if (existing) {
      // Embedding plus keyword: raise rank when both agree.
      existing.score = Math.min(1, existing.score * 0.65 + h.score * 0.45 + 0.12);
      if (!existing.case_numbers.length && h.case_numbers?.length) {
        existing.case_numbers = h.case_numbers;
      }
      if (h.snippet && h.snippet.length > existing.snippet.length) {
        existing.snippet = h.snippet;
      }
      continue;
    }
    byKey.set(key, {
      kind: h.kind === "comment" ? "comment" : "passage",
      id: h.id,
      file_id: h.file_id,
      drive_id: h.drive_id,
      anchor: h.anchor,
      title: h.title,
      snippet: h.snippet,
      score: h.score,
      case_numbers: h.case_numbers ?? [],
      type: h.type,
      team_id: h.team_id ?? null,
    });
  }

  // Truth Sources (claims queue / truth_items)
  if (!input.type || input.type === "truth" || input.type === "truth_source") {
    if (isSampleDataMode()) {
      const store = await readStore();
      for (const t of store.truth_items) {
        if (input.teamId && t.team_id !== input.teamId) continue;
        if (!t.text.toLowerCase().includes(lower)) continue;
        const caseRow = store.cases.find((c) => c.id === t.case_id);
        if (
          input.caseNumber != null &&
          caseRow &&
          caseRow.number !== input.caseNumber
        ) {
          continue;
        }
        const key = `truth:${t.id}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          kind: "truth",
          id: t.id,
          file_id: null,
          drive_id: null,
          anchor: t.kind,
          title: "Truth Source",
          snippet: t.text.slice(0, 400),
          score: 0.55,
          case_numbers: caseRow ? [caseRow.number] : [],
          type: "truth_source",
          team_id: t.team_id,
        });
      }
    } else {
      const sb = getServiceSupabase();
      let query = sb
        .from("truth_items")
        .select("id,team_id,case_id,kind,text,status")
        .ilike("text", `%${q}%`)
        .limit(40);
      if (input.teamId) query = query.eq("team_id", input.teamId);
      const { data, error } = await query;
      assertOk(error, "searchLibraryUnified.truth");
      const caseIds = [
        ...new Set((data ?? []).map((r) => r.case_id).filter(Boolean)),
      ] as string[];
      const caseMap = new Map<string, number>();
      if (caseIds.length) {
        const cases = await sb
          .from("cases")
          .select("id,number")
          .in("id", caseIds);
        assertOk(cases.error, "searchLibraryUnified.truthCases");
        for (const c of cases.data ?? []) caseMap.set(c.id, c.number);
      }
      for (const t of data ?? []) {
        const num = t.case_id ? caseMap.get(t.case_id) : undefined;
        if (input.caseNumber != null && num !== input.caseNumber) continue;
        const key = `truth:${t.id}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          kind: "truth",
          id: t.id,
          file_id: null,
          drive_id: null,
          anchor: t.kind,
          title: "Truth Source",
          snippet: String(t.text).slice(0, 400),
          score: 0.55,
          case_numbers: num != null ? [num] : [],
          type: "truth_source",
          team_id: t.team_id,
        });
      }
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
