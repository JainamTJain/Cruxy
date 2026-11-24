/**
 * Always produce a live one pager for a team × case from the working document
 * (or the truth source when the working document is empty). Never returns null.
 */
import "server-only";

import { createHash, randomUUID } from "crypto";
import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import { listCases, logActivity } from "@/lib/db/repository";
import {
  ensureWorkingSections,
  listAllSuggestions,
  listWorkingSections,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";
import { upsertTeamBrief } from "@/lib/db/supabase/team-brief-extra";
import {
  bodyFromWorkingSections,
  SYNC_NOTE,
  handEditedNote,
} from "@/lib/working-doc/one-pager-from-working";
import { compressSectionsForOnePager, sectionsContentHash } from "@/lib/working-doc/one-pager-compress";
import { flagsForOnePager, type OnePagerLineFlag } from "@/lib/working-doc/one-pager-line-flags";
import {
  fillWorkingDocFromTruth,
  truthSourceForCase,
  fillFromParsed,
} from "@/lib/working-doc/start-all-from-truth";
import {
  draftOnePager,
  latestOnePager,
  saveOnePagerEdit,
} from "@/lib/revision/repository";
import type { OnePager, OnePagerBody } from "@/lib/revision/types";
import { withEmptyRows } from "@/lib/revision/one-pager-edit";

function sameBody(a: OnePagerBody, b: OnePagerBody): boolean {
  const pick = (x: OnePagerBody) =>
    JSON.stringify({
      c: x.claims,
      k: x.counterclaim,
      l: x.language?.plain,
      v: x.visuals
        .filter((v) =>
          ["values_scale", "question_table", "claim_map"].includes(v.kind),
        )
        .map((v) => v.payload),
    });
  return pick(a) === pick(b);
}

function syntheticPage(opts: {
  teamId: string;
  caseId: string;
  body: OnePagerBody;
  hash: string;
}): OnePager {
  return {
    id: `derived:${opts.teamId}:${opts.caseId}`,
    team_id: opts.teamId,
    case_id: opts.caseId,
    version: 0,
    body: opts.body,
    previous_body: null,
    change_note: `Derived from working document (${opts.hash.slice(0, 8)})`,
    signed_off_by: [],
    drive_doc_id: null,
    drive_pdf_exported: false,
    origin_tag: "Cruxy",
    created_at: new Date().toISOString(),
    created_by: null,
  };
}

/**
 * Make sure the team has a working document filled from the truth source when
 * sections are empty. Safe to call on every load.
 */
export async function ensureWorkingDocForOnePager(opts: {
  caseId: string;
  teamId: string;
  personId: string | null;
}): Promise<{
  sections: { section_key: WorkingSectionKey; body: string }[];
  thesisFallback: string | null;
}> {
  const brief = await ensureTeamBrief({
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
  });
  const caseRow = (await listCases()).find((c) => c.id === opts.caseId) ?? null;

  if (!brief.working_path) {
    await upsertTeamBrief({
      team_id: opts.teamId,
      case_id: opts.caseId,
      mode: "build_in_crux",
      working_path: "crux",
      created_by: opts.personId,
    });
  }

  let sections = await ensureWorkingSections(
    (await ensureTeamBrief({
      teamId: opts.teamId,
      caseId: opts.caseId,
      personId: opts.personId,
    })).id,
    opts.personId,
  );

  const empty = !sections.some((s) => s.body.trim());
  if (empty && caseRow) {
    const briefNow = await ensureTeamBrief({
      teamId: opts.teamId,
      caseId: opts.caseId,
      personId: opts.personId,
    });
    await fillWorkingDocFromTruth({
      briefId: briefNow.id,
      caseNumber: caseRow.number,
      personId: opts.personId,
      caseId: opts.caseId,
      existing: Object.fromEntries(
        sections.map((x) => [x.section_key, x.body ?? ""]),
      ),
    });
    sections = await listWorkingSections(briefNow.id);
  }

  // Still empty (no domain file): synthesise from truth source in memory.
  if (!sections.some((s) => s.body.trim()) && caseRow) {
    const parsed = truthSourceForCase(caseRow.number);
    if (parsed) {
      const fill = fillFromParsed(parsed);
      sections = (Object.entries(fill) as [WorkingSectionKey, string][]).map(
        ([section_key, body]) => ({
          section_key,
          body,
          id: randomUUID(),
          brief_id: brief.id,
          updated_at: new Date().toISOString(),
          updated_by: opts.personId,
        }),
      );
    }
  }

  const briefFresh = await ensureTeamBrief({
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
  });
  return {
    sections: sections.map((s) => ({
      section_key: s.section_key,
      body: s.body ?? "",
    })),
    thesisFallback: briefFresh.thesis,
  };
}

export type EnsureOnePagerResult = {
  onePager: OnePager;
  flags: OnePagerLineFlag[];
  sourceHash: string;
  derived: boolean;
};

/**
 * Always return a one pager. When the viewer can persist, keep the stored
 * version in step with the working document (unless they hand-edited it).
 */
export async function ensureLiveOnePager(opts: {
  caseId: string;
  teamId: string;
  personId: string | null;
  /** Persist / overwrite auto-synced versions. */
  canPersist: boolean;
}): Promise<EnsureOnePagerResult> {
  const { sections, thesisFallback } = await ensureWorkingDocForOnePager(opts);
  const hash = sectionsContentHash(sections);

  const compressed = await compressSectionsForOnePager({
    sections,
    personId: opts.personId,
    caseId: opts.caseId,
    teamId: opts.teamId,
  });

  const ticked = (
    await listAllSuggestions({ teamId: opts.teamId, caseId: opts.caseId })
  ).filter(
    (s) =>
      s.status === "ticked" &&
      (s.section_key === "support" || s.section_key === "claims"),
  );

  const body = withEmptyRows(
    bodyFromWorkingSections({
      sections: compressed,
      acceptedTexts: ticked
        .map((s) => s.stronger_version || s.text)
        .filter(Boolean) as string[],
      thesisFallback,
    }),
  );

  const thesis =
    body.language?.plain ||
    (
      body.visuals.find((v) => v.kind === "claim_map")?.payload as {
        thesis?: string;
      }
    )?.thesis ||
    "";
  const flags = flagsForOnePager({
    sections,
    thesis,
    claims: body.claims,
    counterclaimText: body.counterclaim?.text ?? "",
  });

  let current = await latestOnePager(opts.teamId, opts.caseId);

  const bodyLooksEmpty =
    !body.language?.plain?.trim() &&
    !body.claims.some((c) => c.text.trim()) &&
    !(body.counterclaim?.text ?? "").trim();

  if (opts.canPersist && opts.personId) {
    const note = current?.change_note ?? "";
    const auto = !current || !handEditedNote(note);
    // Never replace a stored one pager that already has real content with an
    // empty derived body (e.g. working doc not filled yet).
    const shouldWrite =
      auto &&
      !sameBody(current?.body ?? { claims: [], counterclaim: null, visuals: [], empty_rows: [] }, body) &&
      (!bodyLooksEmpty || !current);

    if (!current) {
      current = await draftOnePager({
        teamId: opts.teamId,
        caseId: opts.caseId,
        personId: opts.personId,
      });
      if (!bodyLooksEmpty) {
        current = await saveOnePagerEdit({
          onePagerId: current.id,
          body,
          changeNote: `${SYNC_NOTE} [${hash.slice(0, 8)}]`,
          personId: opts.personId,
        });
      }
      await logActivity({
        person_id: opts.personId,
        action: "one_pager_ensured",
        target: current.id,
        meta: { teamId: opts.teamId, caseId: opts.caseId, hash },
      });
    } else if (shouldWrite && !bodyLooksEmpty) {
      current = await saveOnePagerEdit({
        onePagerId: current.id,
        body,
        changeNote: `${SYNC_NOTE} [${hash.slice(0, 8)}]`,
        personId: opts.personId,
      });
    }
  }

  if (current) {
    // Hand-edited: still show stored page, but refresh flags from working doc.
    return {
      onePager: current,
      flags,
      sourceHash: hash,
      derived: false,
    };
  }

  return {
    onePager: syntheticPage({
      teamId: opts.teamId,
      caseId: opts.caseId,
      body,
      hash,
    }),
    flags,
    sourceHash: hash,
    derived: true,
  };
}

/** Stable content fingerprint for clients (print cache busting, etc.). */
export function onePagerBodyHash(body: OnePagerBody): string {
  return createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 16);
}
