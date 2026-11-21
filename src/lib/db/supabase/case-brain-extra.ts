/**
 * Workstream C extras: queries not yet on the shared repository surface.
 * Sample mode reads the JSON store; live mode uses Supabase service role.
 */
import "server-only";

import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type DeckOptInRow = {
  person_id: string;
  case_id: string;
  assigned: boolean;
};

export async function listDeckOptInsForCase(
  caseId: string,
): Promise<DeckOptInRow[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.deck_opt_ins
      .filter((d) => d.case_id === caseId)
      .map((d) => ({
        person_id: d.person_id,
        case_id: d.case_id,
        assigned: d.assigned,
      }));
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("deck_opt_ins")
    .select("person_id, case_id, assigned")
    .eq("case_id", caseId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    person_id: String(r.person_id),
    case_id: String(r.case_id),
    assigned: Boolean(r.assigned),
  }));
}
