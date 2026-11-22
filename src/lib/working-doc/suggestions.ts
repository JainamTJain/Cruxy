/**
 * Clean entry point for H's critique engine (and anyone else) to add a
 * suggestion beside a team's working document.
 */
import "server-only";

import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import {
  insertSuggestion,
  type WorkingSectionKey,
  type WorkingSuggestionRow,
} from "@/lib/db/supabase/working-doc-extra";

export type AddWorkingDocSuggestionInput = {
  caseId: string;
  teamId: string;
  /** Who triggered the add (member, or null for system / Cruxy). */
  personId?: string | null;
  kind: WorkingSuggestionRow["kind"];
  text: string;
  citation?: string | null;
  sectionKey?: WorkingSectionKey | null;
  paragraphAnchor?: string | null;
  source?: WorkingSuggestionRow["source"];
  truthItemId?: string | null;
  briefId?: string | null;
};

/**
 * Add a pending suggestion on a team's working document.
 * Creates the team brief shell if needed. Never invents people attribution
 * when personId is null (anonymous / Cruxy / traveled ideas).
 */
export async function addWorkingDocSuggestion(
  input: AddWorkingDocSuggestionInput,
): Promise<WorkingSuggestionRow> {
  const text = input.text.trim().replace(/[·—–]/g, ",");
  if (text.length < 8) {
    throw new Error("Suggestion text is too short.");
  }

  let briefId = input.briefId ?? null;
  if (!briefId) {
    const brief = await ensureTeamBrief({
      teamId: input.teamId,
      caseId: input.caseId,
      personId: input.personId ?? null,
    });
    briefId = brief.id;
  }

  return insertSuggestion({
    case_id: input.caseId,
    team_id: input.teamId,
    brief_id: briefId,
    kind: input.kind,
    text,
    citation: input.citation ?? null,
    paragraph_anchor: input.paragraphAnchor ?? null,
    section_key: input.sectionKey ?? null,
    source: input.source ?? "cruxy",
    truth_item_id: input.truthItemId ?? null,
    created_by: input.personId ?? null,
  });
}
