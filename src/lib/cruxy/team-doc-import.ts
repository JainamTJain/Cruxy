/**
 * Wave 4 H: import a team's working doc (Drive link or paste).
 * Librarian splits ideas → that team's proposals (origin team_doc);
 * strong ideas fan out as Inspired by Team N; re-import only adds what changed.
 */
import { randomUUID } from "crypto";
import { createProposal } from "@/lib/case-brain/service";
import { ideaKeyFromText } from "@/lib/case-brain/idea-key";
import type { Proposal } from "@/lib/case-brain/types";
import { runLibrarianTag } from "@/lib/cruxy/agents/librarian";
import { listCases, listTeams, logActivity } from "@/lib/db/repository";
import {
  findTeamDocImport,
  listProposalIdeaKeysForTeamCase,
  listTeamDocImports,
  replaceTeamDocPassages,
  upsertTeamDocImport,
  type TeamDocImportRow,
  type TeamDocPassageRow,
} from "@/lib/db/supabase/team-docs-extra";
import {
  DriveAccessError,
  extractDriveText,
  getDriveConfigStatus,
  listSampleDriveFiles,
} from "@/lib/library/drive";
import { checksumOf } from "@/lib/library/embeddings";
import type { DriveListedFile } from "@/lib/library/types";
import { PASSAGE_TARGET_WORDS } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";
import { google } from "googleapis";

export type TeamDocImportInput = {
  teamId: string;
  caseId: string;
  personId: string;
  /** Google Doc / Drive file URL or bare file id. */
  driveUrl?: string | null;
  /** Pasted document body. */
  pastedText?: string | null;
  /** Optional display title for pasted docs. */
  title?: string | null;
};

export type TeamDocImportResult = {
  importId: string;
  title: string;
  unchanged: boolean;
  proposalsCreated: number;
  inspiredOffered: number;
  ideasSkipped: number;
  stub: boolean;
  message: string;
};

/** Pull a Drive file id from common Google Doc / Drive URL shapes. */
export function parseDriveFileId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s) && !s.includes("/")) return s;

  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function splitDocPassages(
  text: string,
  meta: {
    importId: string;
    teamId: string;
    caseId: string;
    personId: string;
  },
): TeamDocPassageRow[] {
  const words = text.split(/\s+/).filter(Boolean);
  const at = nowIso();
  if (words.length === 0) {
    return [
      {
        id: randomUUID(),
        import_id: meta.importId,
        team_id: meta.teamId,
        case_id: meta.caseId,
        anchor: "p1",
        text: text || "(empty)",
        ord: 0,
        created_at: at,
        created_by: meta.personId,
      },
    ];
  }

  const passages: TeamDocPassageRow[] = [];
  let i = 0;
  let ord = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + PASSAGE_TARGET_WORDS);
    const body = chunk.join(" ");
    passages.push({
      id: randomUUID(),
      import_id: meta.importId,
      team_id: meta.teamId,
      case_id: meta.caseId,
      anchor: `p${ord + 1}`,
      text: body,
      ord,
      created_at: at,
      created_by: meta.personId,
    });
    i += PASSAGE_TARGET_WORDS;
    ord += 1;
  }
  return passages;
}

function parseServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  return JSON.parse(raw) as { client_email: string; private_key: string };
}

async function fetchDriveListedById(
  fileId: string,
): Promise<{ listed: DriveListedFile; stub: boolean }> {
  const samples = listSampleDriveFiles();
  const sample = samples.find((f) => f.drive_id === fileId);
  if (sample) {
    return { listed: sample, stub: true };
  }

  const status = getDriveConfigStatus();
  const onVercel = Boolean(process.env.VERCEL);
  if (!status.hasServiceAccount) {
    if (onVercel) {
      throw new DriveAccessError(
        "not_configured",
        "GOOGLE_SERVICE_ACCOUNT_JSON is missing.",
      );
    }
    // Local: invent a stub listed file so paste-adjacent testing works
    return {
      listed: {
        drive_id: fileId,
        name: `Drive file ${fileId.slice(0, 8)}`,
        path: `/imported/${fileId}`,
        mime: "application/vnd.google-apps.document",
        modified_at: nowIso(),
        checksum: checksumOf(fileId),
        text_content: [
          "Sample team doc (Drive not configured locally).",
          "Claim idea: name the values in tension before the policy answer.",
          "Support: the voiceless stakeholder is owed a place in the map.",
          "Framework: least-restrictive tool, explained in one plain sentence.",
        ].join("\n"),
      },
      stub: true,
    };
  }

  const sa = parseServiceAccount()!;
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,modifiedTime,md5Checksum",
      supportsAllDrives: true,
    });
    const f = meta.data;
    if (!f.id || !f.name || !f.mimeType) {
      throw new DriveAccessError("api", "Drive returned an incomplete file.");
    }
    const modified = f.modifiedTime ?? nowIso();
    return {
      listed: {
        drive_id: f.id,
        name: f.name,
        path: `/imported/${f.name}`,
        mime: f.mimeType,
        modified_at: modified,
        checksum:
          f.md5Checksum ?? checksumOf(`${f.id}|${modified}|${f.name}`),
      },
      stub: false,
    };
  } catch (err) {
    if (err instanceof DriveAccessError) throw err;
    const statusCode =
      (err as { code?: number })?.code ??
      (err as { response?: { status?: number } })?.response?.status;
    if (statusCode === 404 || statusCode === 403) {
      throw new DriveAccessError(
        "not_shared",
        "That Drive file is not visible to the Crux service account. Share it as Viewer, then try again.",
      );
    }
    throw new DriveAccessError(
      "api",
      err instanceof Error ? err.message : "Could not read that Drive file.",
    );
  }
}

function pickPassageId(
  ideaText: string,
  passages: TeamDocPassageRow[],
): string | null {
  if (!passages.length) return null;
  const words = ideaText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);
  let best: TeamDocPassageRow | null = null;
  let bestScore = -1;
  for (const p of passages) {
    const hay = p.text.toLowerCase();
    const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best?.id ?? passages[0]!.id;
}

async function offerInspiredBy(input: {
  fromTeamId: string;
  caseId: string;
  text: string;
  kind: Proposal["kind"];
  personId: string;
  originRef: string;
  ideaKey: string;
  citationIds: string[];
}): Promise<number> {
  const teams = await listTeams();
  const other = teams.filter((t) => t.id !== input.fromTeamId);
  const fromTeam = teams.find((t) => t.id === input.fromTeamId);
  let created = 0;
  for (const team of other) {
    const existing = await listProposalIdeaKeysForTeamCase({
      teamId: team.id,
      caseId: input.caseId,
      origin: "inspired_by_team",
    });
    if (existing.has(input.ideaKey)) continue;
    await createProposal({
      teamId: team.id,
      caseId: input.caseId,
      personId: input.personId,
      text: input.text,
      kind: input.kind,
      origin: "inspired_by_team",
      originRef: `${fromTeam?.name ?? "Team"}:${input.originRef}`,
      inspiredFromTeamId: input.fromTeamId,
      ideaKey: input.ideaKey,
      citationIds: input.citationIds,
    });
    created += 1;
  }
  return created;
}

/**
 * Import a Drive-linked or pasted team doc into that team's Evidence Library queue.
 */
export async function importTeamDoc(
  input: TeamDocImportInput,
): Promise<TeamDocImportResult> {
  const pasted = (input.pastedText ?? "").trim();
  const driveRaw = (input.driveUrl ?? "").trim();
  if (!pasted && !driveRaw) {
    throw new Error("Paste a doc or paste a Google Drive / Docs link.");
  }

  const cases = await listCases();
  const caseRow = cases.find((c) => c.id === input.caseId);
  if (!caseRow) throw new Error("Case not found.");

  let sourceKind: "drive" | "paste" = "paste";
  let driveFileId: string | null = null;
  let title = (input.title ?? "").trim() || "Pasted team doc";
  let text = pasted;
  let stub = false;

  if (driveRaw && !pasted) {
    sourceKind = "drive";
    const fileId = parseDriveFileId(driveRaw);
    if (!fileId) {
      throw new Error(
        "Could not read a Drive file id from that link. Paste the Google Doc URL or the file id.",
      );
    }
    driveFileId = fileId;
    const { listed, stub: listedStub } = await fetchDriveListedById(fileId);
    stub = listedStub;
    title = listed.name;
    const extracted = await extractDriveText(listed);
    stub = stub || extracted.stub;
    text = extracted.text.trim();
    if (!text || text.startsWith("(Extract failed") || text.startsWith("(No text")) {
      throw new Error(
        "Could not read text from that Drive file. Check sharing with the service account, or paste the text instead.",
      );
    }
  } else if (driveRaw && pasted) {
    // Prefer paste body; keep Drive id for dedupe when present.
    const fileId = parseDriveFileId(driveRaw);
    if (fileId) {
      sourceKind = "drive";
      driveFileId = fileId;
    }
  }

  const checksum = checksumOf(text);
  const existing = driveFileId
    ? await findTeamDocImport({
        teamId: input.teamId,
        driveFileId,
      })
    : await findTeamDocImport({
        teamId: input.teamId,
        caseId: input.caseId,
        checksum,
      });

  if (existing && existing.checksum === checksum) {
    return {
      importId: existing.id,
      title: existing.title,
      unchanged: true,
      proposalsCreated: 0,
      inspiredOffered: 0,
      ideasSkipped: 0,
      stub,
      message: "Nothing new. That doc has not changed since the last import.",
    };
  }

  const importId = existing?.id ?? randomUUID();
  const at = nowIso();
  const row: TeamDocImportRow = {
    id: importId,
    team_id: input.teamId,
    case_id: input.caseId,
    source_kind: sourceKind,
    drive_file_id: driveFileId,
    title,
    checksum,
    text_preview: text.slice(0, 280),
    created_at: existing?.created_at ?? at,
    created_by: input.personId,
    updated_at: at,
  };
  await upsertTeamDocImport(row);

  const passages = splitDocPassages(text, {
    importId,
    teamId: input.teamId,
    caseId: input.caseId,
    personId: input.personId,
  });
  await replaceTeamDocPassages(importId, passages);

  const citationSources = passages.map((p) => ({
    id: p.id,
    text: p.text,
    kind: "passage" as const,
  }));

  const tagged = await runLibrarianTag({
    listed: {
      drive_id: driveFileId ?? `paste:${importId}`,
      name: title,
      path: `/team-docs/${title}`,
      mime: "text/plain",
      modified_at: at,
      checksum,
    },
    text,
    cases,
    personId: input.personId,
    sources: citationSources,
    fixtureKey: "librarian_team_doc",
    stubFallback: () => {
      const lines = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 40)
        .slice(0, 8);
      return {
        case_numbers: [caseRow.number],
        type: "team_notes" as const,
        confidence: 0.8,
        card: `What: ${title}\nCase(s): ${caseRow.number}\nType: team_notes\nNew: ${lines[0]?.slice(0, 80) ?? "See passages."}\nOpen: Ready for Evidence Library?`,
        ideas: (lines.length ? lines : [text.slice(0, 200)]).map((line, i) => ({
          text: line.slice(0, 280),
          kind: "other" as const,
          case_number: caseRow.number,
          citation_ids: [],
          strength: i === 0 ? ("strong" as const) : ("normal" as const),
        })),
        frameworks: [],
        facts: [],
        moderator_questions: [],
        coach_decisions: [],
      };
    },
  });
  stub = stub || tagged.stub;

  const existingKeys = await listProposalIdeaKeysForTeamCase({
    teamId: input.teamId,
    caseId: input.caseId,
  });

  let proposalsCreated = 0;
  let inspiredOffered = 0;
  let ideasSkipped = 0;
  const originRef = `team_doc:${importId}`;
  const candidateIdeas: Array<{
    text: string;
    kind: string;
    proposalId: string;
    citationIds: string[];
  }> = [];

  for (const idea of tagged.ideas) {
    const ideaText = idea.text.trim();
    if (!ideaText) continue;
    const key = ideaKeyFromText(ideaText);
    if (existingKeys.has(key)) {
      ideasSkipped += 1;
      continue;
    }

    const passageId = pickPassageId(ideaText, passages);
    const citationIds = [
      ...(passageId ? [passageId] : []),
      ...(idea.citation_ids ?? []),
    ].filter(Boolean);

    const kind =
      idea.kind === "fact" ||
      idea.kind === "quote" ||
      idea.kind === "example" ||
      idea.kind === "framework"
        ? idea.kind
        : "other";

    const proposal = await createProposal({
      teamId: input.teamId,
      caseId: input.caseId,
      personId: input.personId,
      text: ideaText,
      kind,
      origin: "team_doc",
      originRef,
      citationIds,
      ideaKey: key,
    });
    proposalsCreated += 1;
    existingKeys.add(key);
    candidateIdeas.push({
      text: ideaText,
      kind,
      proposalId: proposal.id,
      citationIds,
    });

    const strong =
      idea.strength === "strong" ||
      (!proposal.cruxy_note && ideaText.split(/\s+/).length >= 12);

    if (strong) {
      inspiredOffered += await offerInspiredBy({
        fromTeamId: input.teamId,
        caseId: input.caseId,
        text: ideaText,
        kind,
        personId: input.personId,
        originRef: proposal.id,
        ideaKey: key,
        citationIds,
      });
    }
  }

  // Wave 6: candidate nodes for the argument graph.
  try {
    const { writeCandidateNodesFromTeamDoc } = await import(
      "@/lib/arg-graph/candidate-nodes"
    );
    await writeCandidateNodesFromTeamDoc({
      teamId: input.teamId,
      caseId: input.caseId,
      importId,
      personId: input.personId,
      ideas: candidateIdeas,
    });
  } catch {
    // Migration 00029 may not be applied yet.
  }

  await logActivity({
    person_id: input.personId,
    action: "team_doc_imported",
    target: importId,
    meta: {
      team_id: input.teamId,
      case_id: input.caseId,
      source_kind: sourceKind,
      proposalsCreated,
      inspiredOffered,
      ideasSkipped,
      unchanged: false,
    },
  });

  return {
    importId,
    title,
    unchanged: false,
    proposalsCreated,
    inspiredOffered,
    ideasSkipped,
    stub,
    message:
      proposalsCreated === 0 && ideasSkipped > 0
        ? `No new ideas. Skipped ${ideasSkipped} already in the queue.`
        : `Added ${proposalsCreated} idea${proposalsCreated === 1 ? "" : "s"} to your Evidence Library queue${inspiredOffered ? `; offered ${inspiredOffered} Inspired by recommendation${inspiredOffered === 1 ? "" : "s"}` : ""}.`,
  };
}

export async function listImportsForTeam(input: {
  teamId: string;
  caseId?: string | null;
}) {
  return listTeamDocImports(input);
}
