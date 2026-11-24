/**
 * Sample-mode Drive files so Prep notes from Drive has real cards to show.
 * Idempotent: skips when the case already has tagged library files.
 */
import "server-only";

import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { updateStore } from "@/lib/db/sample-store";
import type { LibraryFile, Passage } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

const DIRTY_GLOSSARY =
  "Humanity formulacategorical imperativeKant's test for a moral rule: act only on a maxim you could will as a law for every person. A shorter form says: treat every person as an end in themselves, never only as a means. On this case: do not treat people merely as a means [Read more (IEP)](https://iep.utm.edu/kantview/): don't treat people merely as a means";

function fileRow(partial: Partial<LibraryFile> & Pick<LibraryFile, "id" | "name" | "type">): LibraryFile {
  const now = nowIso();
  return {
    drive_id: null,
    path: `/Team Drive/${partial.name}`,
    mime: "text/plain",
    modified_at: now,
    checksum: null,
    case_ids: [],
    case_numbers: [],
    confidence: 1,
    card: null,
    text_content: null,
    scanned_pdf: false,
    unreadable_reason: null,
    status: "digested",
    extracted_ideas: [],
    created_at: now,
    created_by: null,
    ...partial,
  };
}

/**
 * Ensure Case N has a few Drive readings in sample mode (for UI, shots, e2e).
 */
export async function ensureSampleDriveReadings(args: {
  caseId: string;
  caseNumber: number;
}): Promise<void> {
  if (!isSampleDataMode()) return;

  await updateStore((s) => {
    const have = (s.files ?? []).some(
      (f) =>
        f.type !== "case_set" &&
        (f.case_ids.includes(args.caseId) ||
          f.case_numbers.includes(args.caseNumber)),
    );
    if (have) return;

    const notesId = randomUUID();
    const practiceId = randomUUID();
    const researchId = randomUUID();
    const now = nowIso();

    const notes = fileRow({
      id: notesId,
      name: `Case ${args.caseNumber} team prep notes`,
      type: "team_notes",
      case_ids: [args.caseId],
      case_numbers: [args.caseNumber],
      card: `What: Team notes from Drive on case ${args.caseNumber}.\nNew: Stakeholders and the consent line.\nOpen: Who bears the risk if consent is thin?`,
      text_content: [
        "The team agrees the hardest question is whether public interest can override a thin consent.",
        "Everyone always benefits when privacy is ignored, so the case is easy.",
        "A middle path names the harmed parties and asks what a fair notice would require.",
        DIRTY_GLOSSARY,
        "1. AI is efficient at sorting tips, but that is not a moral reason by itself.",
        "*",
        "Imperative: *",
      ].join("\n\n"),
    });

    const practice = fileRow({
      id: practiceId,
      name: `Case ${args.caseNumber} practice transcript`,
      type: "practice_transcript",
      case_ids: [args.caseId],
      case_numbers: [args.caseNumber],
      card: "What: Practice round notes from Drive.\nOpen: How do we answer the public interest push?",
      text_content: [
        "[0:12] Katie: The public interest claim needs a clear harm test before it overrides consent.",
        "[0:40] Nick: Either we protect privacy fully or we abandon it, and that is the only choice.",
        "[1:05] Daniel: Judges will ask who is left out if we only talk about the loudest stakeholders.",
      ].join("\n"),
    });

    const research = fileRow({
      id: researchId,
      name: `Case ${args.caseNumber} research clip`,
      type: "general",
      case_ids: [args.caseId],
      case_numbers: [args.caseNumber],
      card: "What: Short research clip from Drive.",
      text_content:
        "A cited study says consent forms often understate secondary uses. The team should name that gap and say what fair notice would look like in this case.",
    });

    const passages: Passage[] = [];
    for (const f of [notes, practice, research]) {
      const chunks = (f.text_content ?? "")
        .split(/\n\n+/)
        .map((t) => t.trim())
        .filter(Boolean);
      chunks.forEach((text, i) => {
        passages.push({
          id: randomUUID(),
          file_id: f.id,
          drive_id: null,
          ord: i,
          anchor: `p${i + 1}`,
          text,
          embedding: null,
          created_at: now,
          created_by: null,
        });
      });
    }

    s.files = [...(s.files ?? []), notes, practice, research];
    s.passages = [...(s.passages ?? []), ...passages];
  });
}
