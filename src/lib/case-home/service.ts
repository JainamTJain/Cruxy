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
import { distillFileSegments } from "@/lib/library/segments";
import type { LibraryFile } from "@/lib/library/types";
import { listQuestions } from "@/lib/revision/repository";
import { listClaimMapVersions } from "@/lib/team/repository";
import type { CaseRow } from "@/lib/types";
import type {
  CaseAnnotation,
  CaseFileBrief,
  CaseHomePayload,
  CaseParagraph,
  IdeaEvent,
} from "@/lib/case-home/types";

function clip(text: string, n = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

async function ensureSegmentsForFiles(
  files: LibraryFile[],
  caseId: string,
): Promise<void> {
  const existing = await listSegmentsForCase(caseId);
  const have = new Set(existing.map((s) => s.file_id));
  for (const file of files) {
    if (have.has(file.id)) continue;
    const passages = await listPassagesForFile(file.id);
    if (passages.length === 0 && !file.card) continue;
    const segments = distillFileSegments({
      file,
      passages,
      caseId,
    });
    await replaceFileSegments(file.id, segments);
  }
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
}): Promise<CaseHomePayload> {
  const { caseId, teamId, caseRow } = args;

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

  await ensureSegmentsForFiles(caseFiles, caseId);
  const segments = await listSegmentsForCase(caseId);
  const segments_by_file: CaseHomePayload["segments_by_file"] = {};
  for (const s of segments) {
    (segments_by_file[s.file_id] ??= []).push(s);
  }

  const caseSet =
    caseFiles.find((f) => f.type === "case_set") ??
    caseFiles.find((f) => /case set|ieb/i.test(f.name)) ??
    null;

  let paragraphs: CaseParagraph[] = [];
  const annotations: CaseAnnotation[] = [];
  let source: CaseHomePayload["source"] = "seed";

  if (caseSet) {
    const passages = await listPassagesForFile(caseSet.id);
    if (passages.length > 0) {
      source = "case_set";
      paragraphs = passages.map((p) => ({
        id: p.id,
        text: p.text,
        anchor: p.anchor,
        file_id: caseSet.id,
      }));
      const [highlights, comments] = await Promise.all([
        listHighlightsForFile(caseSet.id),
        listCommentsForFile(caseSet.id),
      ]);
      let people: { id: string; name: string; team_id: string | null }[] = [];
      if (isSampleDataMode()) {
        const store = await readStore();
        people = store.people.map((p) => ({
          id: p.id,
          name: p.name,
          team_id: p.team_id,
        }));
      } else {
        const { listPeopleFull } = await import("@/lib/db/repository");
        people = (await listPeopleFull()).map((p) => ({
          id: p.id,
          name: p.name,
          team_id: p.team_id,
        }));
      }
      const names = personNameMap(people);
      for (const h of highlights) {
        annotations.push({
          id: h.id,
          kind: "highlight",
          body: h.body?.trim() || "Highlight",
          range: h.range,
          person_name: names.get(h.person_id) ?? null,
          team_colour: null,
          passage_anchor:
            passages.find((p) => p.id === h.passage_id)?.anchor ?? null,
          created_at: h.created_at,
        });
      }
      for (const c of comments) {
        annotations.push({
          id: c.id,
          kind: "comment",
          body: c.body,
          range: c.range,
          person_name: names.get(c.person_id) ?? null,
          team_colour: null,
          passage_anchor:
            passages.find((p) => p.id === c.passage_id)?.anchor ?? null,
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
    for (const q of questions.filter((q) => q.status === "active").slice(0, 6)) {
      annotations.push({
        id: q.id,
        kind: "question",
        body: q.text || "Question",
        range: null,
        person_name: null,
        team_colour: null,
        passage_anchor: null,
        created_at: q.created_at,
      });
    }
  } else {
    for (const q of questions.filter((q) => q.status === "active").slice(0, 6)) {
      annotations.push({
        id: q.id,
        kind: "question",
        body: q.text || "Question",
        range: null,
        person_name: null,
        team_colour: null,
        passage_anchor: null,
        created_at: q.created_at,
      });
    }
  }

  let peopleNames = new Map<string, string>();
  if (isSampleDataMode()) {
    const store = await readStore();
    peopleNames = personNameMap(store.people);
  } else {
    const { listPeopleFull } = await import("@/lib/db/repository");
    peopleNames = personNameMap(await listPeopleFull());
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

  const files: CaseFileBrief[] = caseFiles.map((f) => {
    const segs = segments_by_file[f.id] ?? [];
    const what = segs.find((s) => s.kind === "what")?.body ?? null;
    return {
      id: f.id,
      name: f.name,
      type: f.type,
      path: f.path,
      segment_count: segs.length,
      what,
    };
  });

  return {
    case: caseRow,
    stakeholders,
    paragraphs,
    annotations,
    ideas: ideas.slice(0, 24),
    files,
    segments_by_file,
    source,
  };
}
