/**
 * Shared poster for the working-document suggestion rail.
 * Critique engine (H) and idea travel (C) both write through here so caps,
 * plain-copy rules, and anonymity stay consistent.
 */
import "server-only";

import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import {
  insertSuggestion,
  listPendingSuggestions,
  type WorkingSectionKey,
  type WorkingSuggestionRow,
} from "@/lib/db/supabase/working-doc-extra";
import { OPEN_PER_SECTION_CAP } from "@/lib/critique/types";

export type PostSuggestionInput = {
  caseId: string;
  teamId: string;
  personId: string | null;
  kind: WorkingSuggestionRow["kind"];
  sectionKey: WorkingSectionKey | null;
  /** Full rail text (already plain: no em dashes, no middle dots). */
  text: string;
  source?: WorkingSuggestionRow["source"];
  citation?: string | null;
  truthItemId?: string | null;
  paragraphAnchor?: string | null;
  briefId?: string | null;
  weakSpot?: string | null;
  whyWeak?: string | null;
  strongerVersion?: string | null;
  questionBack?: string | null;
  fallacyName?: string | null;
  truthSourceRef?: string | null;
  cannotCite?: boolean;
  logicChain?: string | null;
};

function scrub(s: string): string {
  return s.replace(/[·—–]/g, ",").replace(/\s+/g, " ").trim();
}

/** Strip team labels so anonymous travel never leaks identity. */
export function scrubTeamNames(s: string): string {
  return scrub(s)
    .replace(/\binspired by\s+team\s*[123]\b/gi, "another view")
    .replace(/\bteam\s*[123]\b/gi, "another view")
    .replace(/\binspired by\b/gi, "another view")
    .replace(/(?:\banother view\b\s*){2,}/gi, "another view ");
}

/**
 * Post one or more suggestions. Enforces top OPEN_PER_SECTION_CAP open
 * suggestions per section (null section uses a shared bucket).
 */
export async function postSuggestions(
  inputs: PostSuggestionInput[],
): Promise<{ posted: WorkingSuggestionRow[]; skippedCap: number }> {
  const posted: WorkingSuggestionRow[] = [];
  let skippedCap = 0;

  // Group by team/case so we load pending once per target.
  const byTarget = new Map<string, PostSuggestionInput[]>();
  for (const input of inputs) {
    const key = `${input.teamId}:${input.caseId}`;
    const list = byTarget.get(key) ?? [];
    list.push(input);
    byTarget.set(key, list);
  }

  for (const [, batch] of byTarget) {
    const first = batch[0]!;
    const pending = await listPendingSuggestions({
      teamId: first.teamId,
      caseId: first.caseId,
    });
    const openBySection = new Map<string, number>();
    for (const p of pending) {
      const sk = p.section_key ?? "_";
      openBySection.set(sk, (openBySection.get(sk) ?? 0) + 1);
    }

    let briefId = first.briefId ?? null;
    if (!briefId) {
      const brief = await ensureTeamBrief({
        teamId: first.teamId,
        caseId: first.caseId,
        personId: first.personId,
      });
      briefId = brief.id;
    }

    for (const input of batch) {
      const sk = input.sectionKey ?? "_";
      const open = openBySection.get(sk) ?? 0;
      if (open >= OPEN_PER_SECTION_CAP) {
        skippedCap += 1;
        continue;
      }
      const text = scrubTeamNames(input.text);
      if (text.length < 8) continue;

      const row = await insertSuggestion({
        case_id: input.caseId,
        team_id: input.teamId,
        brief_id: briefId,
        kind: input.kind,
        text,
        citation: input.citation ? scrub(input.citation) : null,
        paragraph_anchor: input.paragraphAnchor ?? null,
        section_key: input.sectionKey,
        source: input.source ?? "cruxy",
        truth_item_id: input.truthItemId ?? null,
        created_by: input.source === "anonymous_travel" ? null : input.personId,
        weak_spot: input.weakSpot ? scrub(input.weakSpot) : null,
        why_weak: input.whyWeak ? scrub(input.whyWeak) : null,
        stronger_version: input.strongerVersion
          ? scrub(input.strongerVersion)
          : null,
        question_back: input.questionBack ? scrub(input.questionBack) : null,
        fallacy_name: input.fallacyName ? scrub(input.fallacyName) : null,
        truth_source_ref: input.truthSourceRef
          ? scrub(input.truthSourceRef)
          : null,
        cannot_cite: Boolean(input.cannotCite),
        logic_chain: input.logicChain ? scrub(input.logicChain) : null,
      });
      posted.push(row);
      openBySection.set(sk, open + 1);
    }
  }

  return { posted, skippedCap };
}
