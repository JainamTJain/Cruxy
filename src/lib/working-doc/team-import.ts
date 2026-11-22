/**
 * Team-level "Import our documents": fetch Drive/paste, split by case, review, confirm.
 */
import "server-only";

import { createHash } from "crypto";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { parseDriveFileId } from "@/lib/cruxy/team-doc-import";
import { listCases, logActivity } from "@/lib/db/repository";
import {
  confirmTeamDocBatch,
  getTeamDocBatch,
  insertBatchSource,
  insertBatchSplit,
  insertTeamDocBatch,
  latestOpenBatchForTeam,
  listBatchSources,
  listBatchSplits,
  updateSplitAssignment,
  type TeamDocBatchSplitRow,
} from "@/lib/db/supabase/team-import-extra";
import {
  ensureWorkingSections,
  listWorkingSections,
  updateWorkingSection,
} from "@/lib/db/supabase/working-doc-extra";
import { upsertTeamBrief } from "@/lib/db/supabase/team-brief-extra";
import {
  DriveAccessError,
  extractDriveText,
  getDriveConfigStatus,
} from "@/lib/library/drive";
import type { DriveListedFile } from "@/lib/library/types";
import {
  formatSplitReview,
  splitDocumentByCase,
} from "@/lib/working-doc/split-by-case";
import { proposeOnePagerFromWorkingDoc } from "@/lib/working-doc/one-pager-from-working";
import { addWorkingDocSuggestion } from "@/lib/working-doc/suggestions";

function checksum(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function multiCaseStubBody(): Promise<string> {
  return listCases().then((cases) => {
    const active = cases.filter((c) => c.active).slice(0, 3);
    return active
      .map(
        (c) =>
          `# Case ${c.number}: ${c.title}\n\n## Our answer\nSample import for ${c.title}.\n\n## Claims\nClaim 1 for case ${c.number}.\nClaim 2 for case ${c.number}.\n`,
      )
      .join("\n\n");
  });
}

async function loadSourceText(opts: {
  driveUrl?: string | null;
  pastedText?: string | null;
  title?: string | null;
}): Promise<{
  title: string;
  body: string;
  driveFileId: string | null;
  driveUrl: string | null;
  stub: boolean;
}> {
  const pasted = opts.pastedText?.trim() ?? "";
  if (pasted) {
    return {
      title: opts.title?.trim() || "Pasted document",
      body: pasted,
      driveFileId: null,
      driveUrl: null,
      stub: false,
    };
  }

  const url = opts.driveUrl?.trim() ?? "";
  const fileId = parseDriveFileId(url);
  if (!fileId) {
    throw new Error("Paste a Google Doc link or the document text.");
  }

  const status = getDriveConfigStatus();
  if (!status.configured) {
    const stubBody = await multiCaseStubBody();
    return {
      title: "Sample multi-case doc",
      body: stubBody,
      driveFileId: fileId,
      driveUrl: url,
      stub: true,
    };
  }

  try {
    const listed: DriveListedFile = {
      drive_id: fileId,
      name: opts.title?.trim() || `Drive file ${fileId.slice(0, 8)}`,
      path: `/imported/${fileId}`,
      mime: "application/vnd.google-apps.document",
      modified_at: new Date().toISOString(),
      checksum: checksum(fileId),
    };
    const extracted = await extractDriveText(listed);
    return {
      title: listed.name,
      body: extracted.text,
      driveFileId: fileId,
      driveUrl: url,
      stub: extracted.stub,
    };
  } catch (e) {
    if (e instanceof DriveAccessError) {
      throw new Error(e.message);
    }
    throw e;
  }
}

function mapChunkToSections(body: string): Record<string, string> {
  const lower = body.toLowerCase();
  const pick = (...labels: string[]) => {
    for (const label of labels) {
      const re = new RegExp(
        `(?:^|\\n)\\s*#{0,3}\\s*${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*#{1,3}\\s+|$)`,
        "i",
      );
      const m = body.match(re);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return "";
  };

  let answer =
    pick("our answer", "answer in one sentence", "thesis", "our thesis") ||
    "";
  if (!answer) {
    const firstPara = body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .find((p) => p.length > 40 && !p.startsWith("#"));
    answer = firstPara?.slice(0, 400) ?? "";
  }

  return {
    answer_one_sentence: answer,
    claims: pick("claims", "claim 1", "our claims"),
    support: pick("support", "supports", "backing"),
    objection_reply: pick(
      "objection",
      "counterclaim",
      "strongest objection",
      "reply",
    ),
    values_in_tension: pick("values", "crux", "values in tension"),
    judges_questions: pick(
      "judges",
      "judge questions",
      "questions judges",
      "questions",
    ),
    // Keep leftover for imported path passages via claims if empty sections.
    _raw: lower ? body : body,
  } as Record<string, string>;
}

export async function createImportReview(opts: {
  teamId: string;
  personId: string;
  sources: Array<{
    driveUrl?: string | null;
    pastedText?: string | null;
    title?: string | null;
  }>;
}) {
  if (!opts.sources.length) {
    throw new Error("Add at least one Google Doc link or pasted file.");
  }

  const batch = await insertTeamDocBatch({
    teamId: opts.teamId,
    personId: opts.personId,
  });
  const cases = await listCases();
  const allPieces = [];

  for (const src of opts.sources) {
    const loaded = await loadSourceText(src);
    const source = await insertBatchSource({
      batch_id: batch.id,
      drive_file_id: loaded.driveFileId,
      drive_url: loaded.driveUrl,
      title: loaded.title,
      body_text: loaded.body,
      checksum: checksum(loaded.body),
    });
    const pieces = splitDocumentByCase(loaded.body, cases);
    for (const p of pieces) {
      const row = await insertBatchSplit({
        batch_id: batch.id,
        source_id: source.id,
        kind: p.kind,
        case_number: p.caseNumber,
        case_id: p.caseId,
        title_guess: p.titleGuess,
        section_count: p.sectionCount,
        body_text: p.body,
        change_summary: null,
        assigned_case_id: p.caseId,
      });
      allPieces.push(row);
    }
  }

  await logActivity({
    person_id: opts.personId,
    action: "team_doc_import_review",
    target: batch.id,
    meta: { splits: allPieces.length },
  });

  return {
    batchId: batch.id,
    reviewLines: formatSplitReview(
      allPieces.map((s) => ({
        kind: s.kind,
        caseNumber: s.case_number,
        caseId: s.case_id,
        titleGuess: s.title_guess,
        sectionCount: s.section_count,
        body: s.body_text,
      })),
    ),
    splits: allPieces,
    cases: cases
      .filter((c) => c.active)
      .map((c) => ({ id: c.id, number: c.number, title: c.title })),
  };
}

export async function getImportReview(opts: {
  batchId: string;
  teamId: string;
}) {
  const batch = await getTeamDocBatch(opts.batchId);
  if (!batch || batch.team_id !== opts.teamId) {
    throw new Error("Import review not found.");
  }
  const splits = await listBatchSplits(batch.id);
  const sources = await listBatchSources(batch.id);
  const cases = (await listCases()).filter((c) => c.active);
  return {
    batch,
    sources: sources.map((s) => ({
      id: s.id,
      title: s.title,
      driveUrl: s.drive_url,
    })),
    reviewLines: formatSplitReview(
      splits.map((s) => ({
        kind: s.kind,
        caseNumber: s.case_number,
        caseId: s.case_id,
        titleGuess: s.title_guess,
        sectionCount: s.section_count,
        body: s.body_text,
      })),
    ),
    splits,
    cases: cases.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
    })),
  };
}

export async function assignUnmatchedSplit(opts: {
  splitId: string;
  caseId: string;
  teamId: string;
  batchId: string;
}) {
  const batch = await getTeamDocBatch(opts.batchId);
  if (!batch || batch.team_id !== opts.teamId) {
    throw new Error("Import review not found.");
  }
  return updateSplitAssignment({
    id: opts.splitId,
    assignedCaseId: opts.caseId,
  });
}

async function fillWorkingDocFromChunk(opts: {
  teamId: string;
  caseId: string;
  personId: string;
  body: string;
  changeSummary: string | null;
}): Promise<{ changed: string[] }> {
  const mapped = mapChunkToSections(opts.body);
  const brief = await upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: "build_in_crux",
    working_path: "crux",
    thesis: mapped.answer_one_sentence || null,
    created_by: opts.personId,
  });
  await ensureWorkingSections(brief.id, opts.personId);
  const before = await listWorkingSections(brief.id);
  const changed: string[] = [];

  for (const key of [
    "answer_one_sentence",
    "claims",
    "support",
    "objection_reply",
    "values_in_tension",
    "judges_questions",
  ] as const) {
    const next = (mapped[key] ?? "").trim();
    if (!next) continue;
    const prev = before.find((s) => s.section_key === key)?.body.trim() ?? "";
    if (prev === next) continue;
    await updateWorkingSection({
      briefId: brief.id,
      sectionKey: key,
      body: next,
      personId: opts.personId,
    });
    changed.push(key);
  }

  if (changed.length && opts.changeSummary) {
    await addWorkingDocSuggestion({
      caseId: opts.caseId,
      teamId: opts.teamId,
      personId: opts.personId,
      kind: "question",
      text: `Re-import updated: ${opts.changeSummary}`,
      source: "cruxy",
    });
  }

  return { changed };
}

export async function confirmImportReview(opts: {
  batchId: string;
  teamId: string;
  personId: string;
}) {
  const batch = await getTeamDocBatch(opts.batchId);
  if (!batch || batch.team_id !== opts.teamId) {
    throw new Error("Import review not found.");
  }
  if (batch.status !== "review") {
    throw new Error("This import was already confirmed.");
  }

  const splits = await listBatchSplits(batch.id);
  const filled: Array<{ caseId: string; changed: string[] }> = [];

  for (const split of splits) {
    const caseId = split.assigned_case_id ?? split.case_id;
    if (!caseId) continue;
    if (split.kind === "not_in_regional" && !split.assigned_case_id) continue;

    const before = await listWorkingSections(
      (
        await ensureTeamBrief({
          teamId: opts.teamId,
          caseId,
          personId: opts.personId,
        })
      ).id,
    );
    const hadContent = before.some((s) => s.body.trim());
    const changeSummary = hadContent
      ? `sections refreshed from import (${split.section_count} sections in source)`
      : null;

    const result = await fillWorkingDocFromChunk({
      teamId: opts.teamId,
      caseId,
      personId: opts.personId,
      body: split.body_text,
      changeSummary,
    });
    filled.push({ caseId, changed: result.changed });

    void proposeOnePagerFromWorkingDoc({
      caseId,
      teamId: opts.teamId,
      personId: opts.personId,
    }).catch(() => undefined);
  }

  await confirmTeamDocBatch({ id: batch.id, personId: opts.personId });
  await logActivity({
    person_id: opts.personId,
    action: "team_doc_import_confirmed",
    target: batch.id,
    meta: { cases: filled.length },
  });

  return {
    filledCases: filled.length,
    details: filled,
  };
}

export async function openOrLatestReview(teamId: string) {
  return latestOpenBatchForTeam(teamId);
}

export type { TeamDocBatchSplitRow };
