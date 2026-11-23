/**
 * Cruxy's edits to the shared truth source.
 *
 * When a team writes an idea that is stronger than, or missing from, the case
 * prep, Cruxy adds it to the shared truth source in its own anonymous words.
 * It then feeds every team's starting document and Cruxy's critique citations.
 * No team is named (docs/decisions.md, "Team privacy and shared ideas").
 *
 * Stored in truth_items with no team and origin "cruxy_from_teams:<section>",
 * so no migration is needed and team views (which filter by team) never list
 * them as another team's work.
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";

const ORIGIN = "cruxy_from_teams";
const SECTIONS: WorkingSectionKey[] = [
  "answer_one_sentence",
  "claims",
  "support",
  "objection_reply",
  "values_in_tension",
  "judges_questions",
];

export type TruthAddition = {
  id: string;
  caseId: string;
  sectionKey: WorkingSectionKey;
  text: string;
  createdAt: string;
};

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []);
}

function similar(a: string, b: string): boolean {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / Math.min(A.size, B.size) >= 0.7;
}

function sectionOf(origin: string | null | undefined): WorkingSectionKey {
  const key = (origin ?? "").split(":")[1] as WorkingSectionKey | undefined;
  return key && SECTIONS.includes(key) ? key : "support";
}

function clean(s: string): string {
  return s
    .replace(/[·—–]/g, ",")
    .replace(/\b(team\s*[123]|inspired by)\b/gi, "another view")
    .replace(/\s+/g, " ")
    .trim();
}

export async function listTruthAdditions(caseId: string): Promise<TruthAddition[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.truth_items
      .filter(
        (t) =>
          t.case_id === caseId &&
          t.status === "accepted" &&
          String((t as { origin?: string }).origin ?? "").startsWith(ORIGIN),
      )
      .map((t) => ({
        id: t.id,
        caseId,
        sectionKey: sectionOf((t as { origin?: string }).origin),
        text: t.text,
        createdAt: t.created_at,
      }));
  }
  const { data, error } = await getServiceSupabase()
    .from("truth_items")
    .select("id,text,origin,created_at")
    .eq("case_id", caseId)
    .eq("status", "accepted")
    .like("origin", `${ORIGIN}%`)
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: String(r.id),
    caseId,
    sectionKey: sectionOf(r.origin as string | null),
    text: String(r.text ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
}

/**
 * Add one anonymous idea to the shared truth source. Skips anything already
 * there in other words (against earlier additions and the given prep text).
 */
export async function addTruthAddition(input: {
  caseId: string;
  sectionKey: WorkingSectionKey;
  text: string;
  personId: string | null;
  /** Prep text to compare against so restatements are not added. */
  existingText?: string[];
}): Promise<TruthAddition | null> {
  const text = clean(input.text);
  if (text.length < 20) return null;
  const current = await listTruthAdditions(input.caseId);
  const pool = [...current.map((c) => c.text), ...(input.existingText ?? [])];
  if (pool.some((p) => similar(p, text))) return null;

  const id = randomUUID();
  const now = new Date().toISOString();
  const origin = `${ORIGIN}:${input.sectionKey}`;
  if (isSampleDataMode()) {
    await updateStore((s) => {
      s.truth_items.push({
        id,
        team_id: null as unknown as string,
        case_id: input.caseId,
        kind: "example",
        text,
        citation_ids: [],
        status: "accepted",
        created_at: now,
        created_by: null,
        updated_at: now,
        origin,
      } as (typeof s.truth_items)[number]);
    });
  } else {
    const { error } = await getServiceSupabase().from("truth_items").insert({
      id,
      team_id: null,
      case_id: input.caseId,
      kind: "example",
      text,
      citation_ids: [],
      status: "accepted",
      origin,
      created_by: null,
    });
    if (error) return null;
  }
  await logActivity({
    person_id: input.personId,
    action: "truth_source_added",
    target: input.caseId,
    meta: { section: input.sectionKey, origin: ORIGIN },
  });
  return { id, caseId: input.caseId, sectionKey: input.sectionKey, text, createdAt: now };
}
