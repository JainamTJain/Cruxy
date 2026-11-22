/**
 * Wave 8 C: Team Brief logic.
 * Mode choice, Drive link (reuse H import), stance, checklist, library candidates.
 */
import { importTeamDoc, parseDriveFileId } from "@/lib/cruxy/team-doc-import";
import { decideProposal } from "@/lib/case-brain/service";
import { logActivity, listTeams } from "@/lib/db/repository";
import { SEED_TEAM_IDS } from "@/lib/seed/ids";
import {
  addChecklistItem,
  decideLibraryCandidate,
  getTeamBrief,
  listChecklist,
  listLibraryCandidates,
  listLinkedOwnDocBriefs,
  setChecklistDone,
  upsertLibraryCandidate,
  upsertTeamBrief,
  type BriefMode,
  type BriefChecklistItemRow,
  type LibraryCandidateRow,
  type TeamBriefRow,
} from "@/lib/db/supabase/team-brief-extra";
import { listTeamDocPassages } from "@/lib/db/supabase/team-docs-extra";
import { findTeamDocImport } from "@/lib/db/supabase/team-docs-extra";

export type TeamBriefView = {
  brief: TeamBriefRow;
  checklist: BriefChecklistItemRow[];
  libraryCandidates: LibraryCandidateRow[];
  confirmedNames: string[];
};

/** Default mode: Team 3 builds in Crux; others start on own doc. */
export function defaultBriefMode(teamId: string): BriefMode {
  if (teamId === SEED_TEAM_IDS.team3) return "build_in_crux";
  return "own_doc";
}

export async function ensureTeamBrief(opts: {
  teamId: string;
  caseId: string;
  personId?: string | null;
}): Promise<TeamBriefRow> {
  const existing = await getTeamBrief(opts.teamId, opts.caseId);
  if (existing) return existing;
  return upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: defaultBriefMode(opts.teamId),
    working_path: null,
    created_by: opts.personId ?? null,
  });
}

export async function getTeamBriefView(opts: {
  teamId: string;
  caseId: string;
  personId?: string | null;
  people?: { id: string; name: string }[];
}): Promise<TeamBriefView> {
  const brief = await ensureTeamBrief(opts);
  const checklist = await listChecklist(brief.id);
  const libraryCandidates = await listLibraryCandidates({
    caseId: opts.caseId,
    status: "pending",
  });
  const people = opts.people ?? [];
  const confirmedNames = brief.confirmed_by
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return { brief, checklist, libraryCandidates, confirmedNames };
}

export async function setBriefMode(opts: {
  teamId: string;
  caseId: string;
  mode: BriefMode;
  personId: string;
}): Promise<TeamBriefRow> {
  await ensureTeamBrief(opts);
  const brief = await upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: opts.mode,
    created_by: opts.personId,
  });
  await logActivity({
    person_id: opts.personId,
    action: "team_brief_mode_set",
    target: brief.id,
    meta: { mode: opts.mode, caseId: opts.caseId, teamId: opts.teamId },
  });
  return brief;
}

export async function linkBriefDriveDoc(opts: {
  teamId: string;
  caseId: string;
  personId: string;
  driveUrl: string;
}): Promise<{ brief: TeamBriefRow; importMessage: string }> {
  const fileId = parseDriveFileId(opts.driveUrl);
  if (!fileId) {
    throw new Error(
      "That does not look like a Google Doc link. Paste the full link from the Ethics Bowl Drive folder.",
    );
  }

  const result = await importTeamDoc({
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
    driveUrl: opts.driveUrl,
  });

  const brief = await upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: "own_doc",
    working_path: "imported",
    drive_file_id: fileId,
    drive_title: result.title,
    last_synced_at: new Date().toISOString(),
    created_by: opts.personId,
  });

  await extractFactCandidatesFromImport({
    teamId: opts.teamId,
    caseId: opts.caseId,
    briefId: brief.id,
    personId: opts.personId,
    driveFileId: fileId,
  });

  await logActivity({
    person_id: opts.personId,
    action: "team_brief_doc_linked",
    target: brief.id,
    meta: { fileId, title: result.title },
  });

  return { brief, importMessage: result.message };
}

/** Re-read every linked own-doc brief (call from Drive sync). */
export async function syncAllOwnDocBriefs(): Promise<{
  synced: number;
  unchanged: number;
  errors: string[];
}> {
  const briefs = await listLinkedOwnDocBriefs();
  let synced = 0;
  let unchanged = 0;
  const errors: string[] = [];
  for (const b of briefs) {
    if (!b.drive_file_id) continue;
    try {
      const result = await importTeamDoc({
        teamId: b.team_id,
        caseId: b.case_id,
        personId: b.created_by ?? "system",
        driveUrl: b.drive_file_id,
      });
      await upsertTeamBrief({
        team_id: b.team_id,
        case_id: b.case_id,
        mode: "own_doc",
        drive_file_id: b.drive_file_id,
        drive_title: result.title,
        last_synced_at: new Date().toISOString(),
      });
      if (!result.unchanged) {
        await extractFactCandidatesFromImport({
          teamId: b.team_id,
          caseId: b.case_id,
          briefId: b.id,
          personId: b.created_by,
          driveFileId: b.drive_file_id,
        });
        synced += 1;
      } else {
        unchanged += 1;
      }
    } catch (e) {
      errors.push(
        `${b.team_id}/${b.case_id}: ${e instanceof Error ? e.message : "sync failed"}`,
      );
    }
  }
  return { synced, unchanged, errors };
}

async function extractFactCandidatesFromImport(opts: {
  teamId: string;
  caseId: string;
  briefId: string;
  personId?: string | null;
  driveFileId: string;
}) {
  const imp = await findTeamDocImport({
    teamId: opts.teamId,
    driveFileId: opts.driveFileId,
  });
  if (!imp) return;
  const passages = await listTeamDocPassages(imp.id);
  for (const p of passages) {
    const facts = pullCitedFacts(p.text);
    for (const f of facts) {
      await upsertLibraryCandidate({
        team_id: opts.teamId,
        case_id: opts.caseId,
        brief_id: opts.briefId,
        text: f.text,
        citation: f.citation,
        source_passage_id: p.id,
        created_by: opts.personId ?? null,
      });
    }
  }
}

/** Facts with a citation marker only. Never treat a thesis line as a fact. */
export function pullCitedFacts(
  text: string,
): { text: string; citation: string }[] {
  const out: { text: string; citation: string }[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(thesis|we (argue|claim|conclude)|our (view|stance))\b/i.test(line)) {
      continue;
    }
    const cite =
      line.match(/\(([^)]{3,120})\)\s*[.!?]?\s*$/)?.[1] ??
      line.match(/\[(\d+[^\]]*)\]/)?.[1] ??
      line.match(/\b(https?:\/\/\S+)\b/)?.[1] ??
      null;
    if (!cite) continue;
    const cleaned = line
      .replace(/\([^)]{3,120}\)\s*[.!?]?\s*$/, "")
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\bhttps?:\/\/\S+/g, "")
      .replace(/[·—–]/g, ",")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+\./g, ".")
      .trim();
    if (cleaned.length < 20 || cleaned.length > 400) continue;
    out.push({ text: cleaned, citation: cite.slice(0, 200) });
  }
  return out.slice(0, 20);
}

export async function setStance(opts: {
  teamId: string;
  caseId: string;
  personId: string;
  thesis: string;
}): Promise<TeamBriefRow> {
  const existing = await ensureTeamBrief(opts);
  const thesis = opts.thesis.trim().replace(/[·—–]/g, ",");
  if (!thesis) throw new Error("Write the agreed thesis in plain words.");
  const bumped = existing.thesis?.trim() !== thesis;
  const brief = await upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: existing.mode,
    thesis,
    stance_version: bumped
      ? existing.stance_version + 1
      : existing.stance_version || 1,
    confirmed_by: bumped ? [opts.personId] : existing.confirmed_by,
    drift_flag: false,
    drift_detail: null,
    created_by: opts.personId,
  });
  await logActivity({
    person_id: opts.personId,
    action: "team_brief_stance_set",
    target: brief.id,
    meta: { version: brief.stance_version },
  });
  return brief;
}

export async function confirmStance(opts: {
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<TeamBriefRow> {
  const existing = await ensureTeamBrief(opts);
  if (!existing.thesis?.trim()) {
    throw new Error("Set the agreed thesis before confirming.");
  }
  const confirmed = existing.confirmed_by.includes(opts.personId)
    ? existing.confirmed_by
    : [...existing.confirmed_by, opts.personId];
  return upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: existing.mode,
    confirmed_by: confirmed,
    created_by: opts.personId,
  });
}

export async function flagStanceDrift(opts: {
  teamId: string;
  caseId: string;
  detail: string;
  personId?: string | null;
}): Promise<TeamBriefRow> {
  const existing = await ensureTeamBrief(opts);
  return upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: existing.mode,
    drift_flag: true,
    drift_detail: opts.detail.replace(/[·—–]/g, ",").slice(0, 500),
    created_by: opts.personId ?? existing.created_by,
  });
}

/**
 * Accept a suggestion beside the Brief.
 * Build-in-Crux: normal proposal accept into Evidence Library.
 * Own-doc: checklist item only (Brief doc is never written).
 */
export async function acceptBriefSuggestion(opts: {
  teamId: string;
  caseId: string;
  personId: string;
  proposalId: string;
  reason: string;
  text: string;
  kind?: BriefChecklistItemRow["kind"];
  editedText?: string | null;
}): Promise<{ mode: BriefMode; checklistItemId?: string }> {
  const brief = await ensureTeamBrief(opts);
  if (brief.mode === "own_doc") {
    const item = await addChecklistItem({
      brief_id: brief.id,
      proposal_id: opts.proposalId,
      text: (opts.editedText ?? opts.text).trim(),
      kind: opts.kind ?? "suggestion",
      created_by: opts.personId,
    });
    // Still record the decision so the queue clears, but do not treat as Library accept.
    await decideProposal({
      proposalId: opts.proposalId,
      personId: opts.personId,
      teamId: opts.teamId,
      verdict: "reject",
      reason:
        opts.reason.trim() ||
        "Accepted as a checklist item for our own doc. Crux does not write to the doc.",
    });
    await logActivity({
      person_id: opts.personId,
      action: "brief_checklist_added",
      target: item.id,
      meta: { proposalId: opts.proposalId },
    });
    return { mode: "own_doc", checklistItemId: item.id };
  }

  const result = await decideProposal({
    proposalId: opts.proposalId,
    personId: opts.personId,
    teamId: opts.teamId,
    verdict: opts.editedText ? "edit" : "accept",
    reason: opts.reason,
    editedText: opts.editedText,
  });
  if (!result.ok) throw new Error(result.error);
  return { mode: "build_in_crux" };
}

export async function markChecklistItem(opts: {
  id: string;
  done: boolean;
  personId: string;
}) {
  return setChecklistDone(opts);
}

export async function decideFactCandidate(opts: {
  id: string;
  accept: boolean;
  personId: string;
  teamId: string;
}) {
  const candidate = await decideLibraryCandidate({
    id: opts.id,
    status: opts.accept ? "accepted" : "rejected",
    personId: opts.personId,
  });
  if (!candidate) return null;

  // Accepted facts enter the Evidence Library for this team (and fan out as Inspired by).
  if (opts.accept) {
    const { createProposal, decideProposal: acceptIntoLibrary } = await import(
      "@/lib/case-brain/service"
    );
    const citation = candidate.citation?.trim();
    const proposal = await createProposal({
      teamId: opts.teamId,
      caseId: candidate.case_id,
      personId: opts.personId,
      text: candidate.text,
      kind: "fact",
      origin: "team_doc",
      originRef: candidate.source_passage_id
        ? `library_candidate:${candidate.id}`
        : `library_candidate:${candidate.id}`,
      citationIds: citation ? [citation] : [],
    });
    await acceptIntoLibrary({
      proposalId: proposal.id,
      personId: opts.personId,
      teamId: opts.teamId,
      verdict: "accept",
      reason: "Accepted from a team doc into the Evidence Library (fact only).",
    });
  }

  await logActivity({
    person_id: opts.personId,
    action: opts.accept
      ? "library_candidate_accepted"
      : "library_candidate_rejected",
    target: candidate.id,
    meta: { caseId: candidate.case_id },
  });
  return candidate;
}

export async function teamNameMap(): Promise<Record<string, string>> {
  const teams = await listTeams();
  return Object.fromEntries(teams.map((t) => [t.id, t.name]));
}
