import "server-only";

import { getCaseBrain } from "@/lib/case-brain/service";
import {
  listCommentsForFile,
  listHighlightsForFile,
  listLibraryFiles,
  listPassagesForFile,
} from "@/lib/db/library-repository";
import { readStore } from "@/lib/db/sample-store";
import {
  listSegmentsForCase,
  listStakeholdersForCase,
  replaceFileSegments,
} from "@/lib/db/supabase/file-segments";
import { isSampleDataMode } from "@/lib/db/config";
import { listOverridesForTeam } from "@/lib/db/supabase/file-segment-overrides";
import {
  cleanSegmentBody,
  plainFileTypeLabel,
  segmentBodyNeedsClean,
} from "@/lib/library/clean-segment-text";
import { BOILERPLATE_RE, distillFileSegments } from "@/lib/library/segments";
import { checkPointFallacy } from "@/lib/case-home/point-fallacy";
import { ensureSampleDriveReadings } from "@/lib/case-home/sample-drive-readings";
import { extractCaseSection } from "@/lib/case-home/case-section";
import type { LibraryFile } from "@/lib/library/types";
import { listQuestions } from "@/lib/revision/repository";
import { listClaimMapVersions } from "@/lib/team/repository";
import type { CaseRow } from "@/lib/types";
import type {
  CaseAnnotation,
  CaseFileBrief,
  CaseHomePayload,
  CaseParagraph,
  CaseReadingSegment,
  IdeaEvent,
} from "@/lib/case-home/types";

function clip(text: string, n = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

/**
 * A file's stored segments need redoing when they repeat (two requests built
 * them at once) or carry site boilerplate (built before the filter existed).
 */
function staleSegments(segs: { kind: string; body: string }[]): boolean {
  const keys = new Set<string>();
  for (const s of segs) {
    if (s.kind === "key_point" && BOILERPLATE_RE.test(s.body)) return true;
    // Transcript stamps or a separate speaker list: built by the old distiller.
    if (/\[\d{1,2}:\d{2}/.test(s.body) || s.kind === "speaker") return true;
    if (segmentBodyNeedsClean(s.body)) return true;
    const k = `${s.kind}:${s.body}`;
    if (keys.has(k)) return true;
    keys.add(k);
  }
  return false;
}

async function ensureSegmentsForFiles(
  files: LibraryFile[],
  caseId: string,
  focus: string,
): Promise<void> {
  const existing = await listSegmentsForCase(caseId);
  const byFile = new Map<string, typeof existing>();
  for (const s of existing) {
    const list = byFile.get(s.file_id) ?? [];
    list.push(s);
    byFile.set(s.file_id, list);
  }
  for (const file of files) {
    const have = byFile.get(file.id);
    if (have && !staleSegments(have)) continue;
    const passages = await listPassagesForFile(file.id);
    if (passages.length === 0 && !file.card) continue;
    const segments = distillFileSegments({
      file,
      passages,
      caseId,
      focus,
    });
    await replaceFileSegments(file.id, segments, caseId);
  }
}

/** Drop repeats left by two requests building the same file at once. */
function dedupeSegments<T extends { file_id: string; kind: string; body: string }>(
  segs: T[],
): T[] {
  const seen = new Set<string>();
  return segs.filter((s) => {
    const k = `${s.file_id}:${s.kind}:${s.body}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Bank questions carry their source as a tag in the text. Show the source as
 * the label and keep the question itself clean.
 */
function questionLabel(text: string): { body: string; label: string } {
  const tags: Array<[RegExp, string]> = [
    [/\s*\((?:the )?case'?s own question\)\s*$/i, "From the case"],
    [/\s*\(case text\)\s*$/i, "From the case"],
    [/\s*\(team'?s version\)\s*$/i, "Our team's version"],
  ];
  for (const [re, label] of tags) {
    if (re.test(text)) return { body: text.replace(re, "").trim(), label };
  }
  return { body: text, label: "Question bank" };
}

function activeQuestionsDrBFirst<T extends { status: string; origin?: string | null }>(qs: T[]): T[] {
  const active = qs.filter((q) => q.status === "active");
  return [...active.filter((q) => q.origin === "dr_b"), ...active.filter((q) => q.origin !== "dr_b")].slice(0, 8);
}

function personNameMap(
  people: { id: string; name: string }[],
): Map<string, string> {
  return new Map(people.map((p) => [p.id, p.name]));
}

export async function getCaseHome(args: {
  caseId: string;
  teamId: string;
  caseRow: CaseRow;
  /**
   * Whose marks to show. Members only see their own team's highlights and
   * comments (team privacy). Admins with seeAllTeams see every team's marks.
   */
  viewerTeamId?: string;
  seeAllTeams?: boolean;
}): Promise<CaseHomePayload> {
  const {
    caseId,
    teamId,
    caseRow,
    viewerTeamId = teamId,
    seeAllTeams = false,
  } = args;

  await ensureSampleDriveReadings({
    caseId,
    caseNumber: caseRow.number,
  });

  const [allFiles, stakeholders, brain, questions, versions] =
    await Promise.all([
      listLibraryFiles(),
      listStakeholdersForCase(caseId),
      getCaseBrain(teamId, caseId),
      listQuestions({ caseId }),
      listClaimMapVersions(teamId, caseId),
    ]);

  const caseFiles = allFiles.filter(
    (f) =>
      f.case_ids.includes(caseId) ||
      f.case_numbers.includes(caseRow.number),
  );

  const caseSet =
    caseFiles.find((f) => f.type === "case_set") ??
    caseFiles.find((f) => /case set|ieb/i.test(f.name)) ??
    null;
  // The case set covers every case; its own section is shown in Reading, so
  // it is not distilled or listed as a separate reading.
  const readingFiles = caseFiles.filter(
    (f) => f.type !== "case_set" && f.id !== caseSet?.id,
  );

  await ensureSegmentsForFiles(
    readingFiles,
    caseId,
    [caseRow.title, caseRow.crux ?? "", caseRow.trap ?? ""].join(" "),
  );
  const segments = dedupeSegments(await listSegmentsForCase(caseId));
  const readingIds = new Set(readingFiles.map((f) => f.id));
  const raw_by_file: Record<string, typeof segments> = {};
  for (const s of segments) {
    if (!readingIds.has(s.file_id)) continue;
    (raw_by_file[s.file_id] ??= []).push(s);
  }

  const allSegIds = Object.values(raw_by_file).flat().map((s) => s.id);
  const overrides = await listOverridesForTeam(teamId, allSegIds);
  const overrideBySeg = new Map(overrides.map((o) => [o.segment_id, o]));

  // People names for "edited by"
  let peopleNames = new Map<string, string>();
  if (isSampleDataMode()) {
    const store = await readStore();
    peopleNames = personNameMap(store.people);
  } else {
    const { listPeopleFull } = await import("@/lib/db/repository");
    peopleNames = personNameMap(await listPeopleFull());
  }

  const segments_by_file: CaseHomePayload["segments_by_file"] = {};
  for (const [fileId, segs] of Object.entries(raw_by_file)) {
    const enriched: CaseReadingSegment[] = [];
    for (const s of segs) {
      const original = cleanSegmentBody(s.body) || s.body;
      const ov = overrideBySeg.get(s.id);
      const display = cleanSegmentBody(ov?.body ?? original) || (ov?.body ?? original);
      enriched.push({
        ...s,
        body: display,
        display_body: display,
        original_body: ov?.original_body ? cleanSegmentBody(ov.original_body) || ov.original_body : original,
        edited_by_name: ov?.edited_by ? peopleNames.get(ov.edited_by) ?? null : null,
        edited_at: ov?.updated_at ?? null,
        fallacy: null,
      });
    }
    // Fallacy checks for key points and notes only (cached by text hash).
    const checkIdx = enriched
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.kind === "key_point" || s.kind === "note");
    const flags = await Promise.all(
      checkIdx.map(({ s }) => checkPointFallacy({ text: s.display_body })),
    );
    for (let j = 0; j < checkIdx.length; j++) {
      enriched[checkIdx[j]!.i]!.fallacy = flags[j] ?? null;
    }
    segments_by_file[fileId] = enriched.filter(
      (s) => s.kind === "what" || Boolean(s.display_body.trim()),
    );
  }

  let paragraphs: CaseParagraph[] = [];
  let sources: { n: number; text: string }[] = [];
  const annotations: CaseAnnotation[] = [];
  let source: CaseHomePayload["source"] = "seed";

  if (caseSet) {
    const passages = await listPassagesForFile(caseSet.id);
    if (passages.length > 0) {
      source = "case_set";
      const section = extractCaseSection(passages, caseRow.number, caseRow.title);
      if (section && section.paragraphs.length) {
        paragraphs = section.paragraphs.map((p, i) => ({
          id: `${caseId}-p${i}`,
          text: p.text,
          anchor: passages.find((x) => x.id === p.passage_id)?.anchor ?? null,
          file_id: caseSet.id,
          passage_id: p.passage_id,
        }));
        sources = section.sources;
      } else {
        // Heading not found: show nothing rather than the whole case set.
        paragraphs = [];
      }
      const [highlights, comments] = await Promise.all([
        listHighlightsForFile(caseSet.id),
        listCommentsForFile(caseSet.id),
      ]);
      let people: {
        id: string;
        name: string;
        team_id: string | null;
        role?: string;
      }[] = [];
      let teams: { id: string; colour: string }[] = [];
      if (isSampleDataMode()) {
        const store = await readStore();
        people = store.people.map((p) => ({
          id: p.id,
          name: p.name,
          team_id: p.team_id,
          role: p.role,
        }));
        teams = store.teams.map((t) => ({ id: t.id, colour: t.colour }));
      } else {
        const { listPeopleFull, listTeams } = await import(
          "@/lib/db/repository"
        );
        people = (await listPeopleFull()).map((p) => ({
          id: p.id,
          name: p.name,
          team_id: p.team_id,
          role: p.role,
        }));
        teams = (await listTeams()).map((t) => ({
          id: t.id,
          colour: t.colour,
        }));
      }
      const names = personNameMap(people);
      const teamByPerson = new Map(
        people.map((p) => [p.id, p.team_id] as const),
      );
      const colourByTeam = new Map(teams.map((t) => [t.id, t.colour]));
      // Dr. B coaches every team: her notes on the case text reach all of them.
      const coachIds = new Set(people.filter((p) => p.role === "coach_admin").map((p) => p.id));
      const allowPerson = (personId: string | null | undefined) => {
        if (!personId) return seeAllTeams;
        if (coachIds.has(personId)) return true;
        const pt = teamByPerson.get(personId);
        if (seeAllTeams) return true;
        return Boolean(pt && pt === viewerTeamId);
      };
      for (const h of highlights) {
        if (!allowPerson(h.person_id)) continue;
        const pt = teamByPerson.get(h.person_id) ?? null;
        annotations.push({
          id: h.id,
          kind: "highlight",
          body: h.body?.trim() || "Highlight",
          range: h.range,
          person_id: h.person_id,
          person_name: names.get(h.person_id) ?? null,
          team_colour: pt ? (colourByTeam.get(pt) ?? null) : null,
          passage_anchor:
            passages.find((p) => p.id === h.passage_id)?.anchor ?? null,
          passage_id: h.passage_id,
          created_at: h.created_at,
        });
      }
      for (const c of comments) {
        if (!allowPerson(c.person_id)) continue;
        const pt = teamByPerson.get(c.person_id) ?? null;
        annotations.push({
          id: c.id,
          kind: "comment",
          body: c.body,
          range: c.range,
          person_id: c.person_id,
          person_name: names.get(c.person_id) ?? null,
          team_colour: pt ? (colourByTeam.get(pt) ?? null) : null,
          passage_anchor:
            passages.find((p) => p.id === c.passage_id)?.anchor ?? null,
          passage_id: c.passage_id,
          created_at: c.created_at,
        });
      }
    }
  }

  if (paragraphs.length === 0) {
    source = "seed";
    const facts = brain.truth_items
      .filter((t) => t.kind === "fact" && t.status === "accepted")
      .slice(0, 12);
    paragraphs = [
      {
        id: "crux",
        text: caseRow.crux
          ? `Crux: ${caseRow.crux.replace(/\*/g, "")}`
          : `${caseRow.title}`,
        anchor: null,
        file_id: null,
      },
      ...(caseRow.trap
        ? [
            {
              id: "trap",
              text: `Trap: ${caseRow.trap}`,
              anchor: null,
              file_id: null,
            },
          ]
        : []),
      ...facts.map((f) => ({
        id: f.id,
        text: f.text,
        anchor: null,
        file_id: null,
      })),
      ...(caseRow.closing_question
        ? [
            {
              id: "closing",
              text: `Closing question: ${caseRow.closing_question}`,
              anchor: null,
              file_id: null,
            },
          ]
        : []),
    ];
    for (const q of activeQuestionsDrBFirst(questions)) {
      const { body, label: tagLabel } = questionLabel(q.text || "Question");
      const label = q.origin === "dr_b" ? "Dr. B" : tagLabel;
      annotations.push({
        id: q.id,
        kind: "question",
        body,
        range: null,
        person_name: label,
        team_colour: null,
        passage_anchor: null,
        created_at: q.created_at,
      });
    }
  } else {
    for (const q of activeQuestionsDrBFirst(questions)) {
      const { body, label: tagLabel } = questionLabel(q.text || "Question");
      const label = q.origin === "dr_b" ? "Dr. B" : tagLabel;
      annotations.push({
        id: q.id,
        kind: "question",
        body,
        range: null,
        person_name: label,
        team_colour: null,
        passage_anchor: null,
        created_at: q.created_at,
      });
    }
  }

  const ideas: IdeaEvent[] = [];
  for (const v of versions.slice(0, 8)) {
    ideas.push({
      id: `ver:${v.id}`,
      at: v.created_at,
      kind: "version",
      title: `Map version ${v.version}`,
      detail: clip(v.change_summary || "Claim map updated"),
      by_name: v.created_by ? peopleNames.get(v.created_by) ?? null : null,
    });
  }
  for (const p of brain.proposals.filter((x) => x.status === "accepted")) {
    ideas.push({
      id: `acc:${p.id}`,
      at: p.created_at,
      kind: "accepted",
      title: "Accepted idea",
      detail: clip(p.text),
      by_name: p.created_by ? peopleNames.get(p.created_by) ?? null : null,
    });
  }
  for (const q of questions
    .filter((x) => x.status === "active")
    .slice(0, 10)) {
    ideas.push({
      id: `q:${q.id}`,
      at: q.created_at,
      kind: "question",
      title: "New question",
      detail: clip(q.text || ""),
      by_name: null,
    });
  }
  for (const h of brain.history.slice(0, 12)) {
    if (ideas.some((i) => i.id.includes(h.target_id))) continue;
    ideas.push({
      id: `hist:${h.id}`,
      at: h.at,
      kind: "note",
      title: h.action.replace(/_/g, " "),
      detail: clip(h.reason ?? h.action),
      by_name: h.person_id ? peopleNames.get(h.person_id) ?? null : null,
    });
  }
  ideas.sort((a, b) => (a.at < b.at ? 1 : -1));

  const files: CaseFileBrief[] = readingFiles.map((f) => {
    const segs = segments_by_file[f.id] ?? [];
    const what =
      segs.find((s) => s.kind === "what")?.display_body ??
      segs.find((s) => s.kind === "what")?.body ??
      null;
    return {
      id: f.id,
      name: f.name,
      type: f.type,
      type_label: plainFileTypeLabel(f.type),
      path: f.path,
      segment_count: segs.length,
      what: what ? cleanSegmentBody(what) || what : null,
    };
  });

  return {
    case: caseRow,
    stakeholders,
    paragraphs,
    sources,
    annotations,
    ideas: ideas.slice(0, 24),
    files,
    segments_by_file,
    source,
  };
}
