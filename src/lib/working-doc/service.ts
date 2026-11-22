/**
 * Working document hub: imported Google Doc or sectioned Crux doc + suggestions.
 */
import "server-only";
import { runCoachSocratic } from "@/lib/cruxy/agents/coach";
import {
  ensureTeamBrief,
  linkBriefDriveDoc,
} from "@/lib/case-brain/team-brief";
import {
  addChecklistItem,
  getTeamBrief,
  listChecklist,
  upsertTeamBrief,
  type TeamBriefRow,
} from "@/lib/db/supabase/team-brief-extra";
import {
  findTeamDocImport,
  listTeamDocPassages,
  type TeamDocPassageRow,
} from "@/lib/db/supabase/team-docs-extra";
import {
  WORKING_SECTION_KEYS,
  WORKING_SECTION_LABELS,
  answerSocratic,
  decideSuggestion,
  ensureWorkingSections,
  getOpenSocratic,
  insertSharedEvidenceFact,
  insertSocratic,
  insertSuggestion,
  listAllSuggestions,
  listEvidenceDecisions,
  listPendingSuggestions,
  listWorkingSections,
  updateWorkingSection,
  upsertEvidenceDecision,
  type WorkingSectionKey,
  type WorkingSuggestionRow,
} from "@/lib/db/supabase/working-doc-extra";
import { listPeopleFull, logActivity } from "@/lib/db/repository";
import { listTruthItems } from "@/lib/revision/repository";

function personName(
  people: { id: string; name: string }[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return people.find((p) => p.id === id)?.name ?? null;
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function loadPassages(
  brief: TeamBriefRow,
): Promise<TeamDocPassageRow[]> {
  if (!brief.drive_file_id) return [];
  const imp = await findTeamDocImport({
    teamId: brief.team_id,
    driveFileId: brief.drive_file_id,
    caseId: brief.case_id,
  });
  if (!imp) return [];
  return listTeamDocPassages(imp.id);
}

async function seedCruxySuggestions(opts: {
  teamId: string;
  caseId: string;
  briefId: string;
  personId: string;
  passages: TeamDocPassageRow[];
}): Promise<void> {
  const pending = await listPendingSuggestions({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  if (pending.length >= 3) return;

  const anchor = opts.passages[0]?.anchor ?? "p1";
  const seeds: Array<{
    kind: WorkingSuggestionRow["kind"];
    text: string;
  }> = [
    {
      kind: "gap",
      text: "Name one stakeholder your answer still leaves out, and what they would ask you.",
    },
    {
      kind: "counter",
      text: "Steelman the other side in one sentence, then answer it with one cited fact.",
    },
    {
      kind: "sharper",
      text: "Cut your thesis to twelve words that a judge can write down in the first minute.",
    },
  ];
  for (const s of seeds) {
    await insertSuggestion({
      case_id: opts.caseId,
      team_id: opts.teamId,
      brief_id: opts.briefId,
      kind: s.kind,
      text: s.text,
      citation: null,
      paragraph_anchor: anchor,
      section_key: null,
      source: "cruxy",
      truth_item_id: null,
      created_by: opts.personId,
    });
  }
}

async function seedEvidenceSuggestions(opts: {
  teamId: string;
  caseId: string;
  briefId: string;
  personId: string;
  passages: TeamDocPassageRow[];
}): Promise<void> {
  const truths = await listTruthItems({ caseId: opts.caseId });
  const accepted = truths
    .filter((t) => t.status === "accepted")
    .slice(0, 8);
  const decisions = await listEvidenceDecisions({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  const decided = new Set(decisions.map((d) => d.truth_item_id));
  const anchor = opts.passages[0]?.anchor ?? null;

  for (const t of accepted) {
    if (decided.has(t.id)) continue;
    const citeMatch = t.text.match(/\(([^)]{3,120})\)\s*$/);
    await insertSuggestion({
      case_id: opts.caseId,
      team_id: opts.teamId,
      brief_id: opts.briefId,
      kind: "evidence",
      text: t.text.replace(/\([^)]{3,120}\)\s*$/, "").trim() || t.text,
      citation: citeMatch?.[1] ?? null,
      paragraph_anchor: anchor,
      section_key: null,
      source: "evidence_library",
      truth_item_id: t.id,
      created_by: opts.personId,
    });
  }
}

export async function getWorkingDocumentHub(opts: {
  caseId: string;
  teamId: string;
  personId: string;
}) {
  const people = await listPeopleFull();
  const brief = await ensureTeamBrief({
    teamId: opts.teamId,
    caseId: opts.caseId,
    personId: opts.personId,
  });

  const path = brief.working_path;
  const checklist = await listChecklist(brief.id);
  const suggestions = await listAllSuggestions({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  const evidenceDecisions = await listEvidenceDecisions({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  const truths = await listTruthItems({ caseId: opts.caseId });
  const library = truths
    .filter((t) => t.status === "accepted")
    .map((t) => {
      const d = evidenceDecisions.find((x) => x.truth_item_id === t.id);
      return {
        id: t.id,
        text: t.text,
        kind: t.kind,
        decision: d?.decision ?? null,
        reason: d?.reason ?? null,
        decided_by_name: personName(people, d?.decided_by),
        decided_at_label: formatWhen(d?.decided_at),
        created_by_name: personName(people, t.created_by),
        created_at_label: formatWhen(t.created_at),
      };
    });

  let passages: TeamDocPassageRow[] = [];
  let sections: Awaited<ReturnType<typeof listWorkingSections>> = [];
  const openSocratic: Record<
    string,
    { id: string; question: string } | null
  > = {};

  if (path === "imported") {
    passages = await loadPassages(brief);
    if (passages.length > 0 || brief.drive_file_id) {
      await seedCruxySuggestions({
        teamId: opts.teamId,
        caseId: opts.caseId,
        briefId: brief.id,
        personId: opts.personId,
        passages,
      });
      await seedEvidenceSuggestions({
        teamId: opts.teamId,
        caseId: opts.caseId,
        briefId: brief.id,
        personId: opts.personId,
        passages,
      });
    }
  }

  if (path === "crux") {
    sections = await ensureWorkingSections(brief.id, opts.personId);
    for (const key of WORKING_SECTION_KEYS) {
      const open = await getOpenSocratic(brief.id, key);
      openSocratic[key] = open
        ? { id: open.id, question: open.question }
        : null;
    }
  }

  const freshSuggestions = await listPendingSuggestions({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });

  return {
    brief: {
      id: brief.id,
      mode: brief.mode,
      working_path: path,
      drive_file_id: brief.drive_file_id,
      drive_title: brief.drive_title,
      thesis: brief.thesis,
      last_synced_at: brief.last_synced_at,
      last_synced_label: formatWhen(brief.last_synced_at),
    },
    sectionDefs: WORKING_SECTION_KEYS.map((key) => ({
      key,
      label: WORKING_SECTION_LABELS[key],
    })),
    passages: passages.map((p) => ({
      id: p.id,
      anchor: p.anchor,
      text: p.text,
      ord: p.ord,
    })),
    sections: sections.map((s) => ({
      key: s.section_key,
      label: WORKING_SECTION_LABELS[s.section_key],
      body: s.body,
      updated_by_name: personName(people, s.updated_by),
      updated_at_label: formatWhen(s.updated_at),
      socratic: openSocratic[s.section_key] ?? null,
    })),
    suggestions: freshSuggestions.map((s) => ({
      id: s.id,
      kind: s.kind,
      text: s.text,
      citation: s.citation,
      paragraph_anchor: s.paragraph_anchor,
      section_key: s.section_key,
      source: s.source,
      created_by_name: personName(people, s.created_by),
      created_at_label: formatWhen(s.created_at),
    })),
    checklist: checklist.map((c) => ({
      id: c.id,
      text: c.text,
      kind: c.kind,
      done: c.done,
      created_by_name: personName(people, c.created_by),
      created_at_label: formatWhen(c.created_at),
      done_by_name: personName(people, c.done_by),
      done_at_label: formatWhen(c.done_at),
    })),
    library,
    crossedCount: suggestions.filter((s) => s.status === "crossed").length,
    viewer: { personId: opts.personId, teamId: opts.teamId },
  };
}

export async function startCruxWorkingDoc(opts: {
  caseId: string;
  teamId: string;
  personId: string;
}) {
  const brief = await upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: "build_in_crux",
    working_path: "crux",
    created_by: opts.personId,
  });
  await ensureWorkingSections(brief.id, opts.personId);
  // Open one Socratic question on the first empty section.
  await askSocraticForSection({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
    sectionKey: "answer_one_sentence",
  });
  await logActivity({
    person_id: opts.personId,
    action: "working_doc_started_crux",
    target: brief.id,
    meta: { caseId: opts.caseId },
  });
  return brief;
}

export async function importWorkingDoc(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  driveUrl: string;
}) {
  const result = await linkBriefDriveDoc(opts);
  await upsertTeamBrief({
    team_id: opts.teamId,
    case_id: opts.caseId,
    mode: "own_doc",
    working_path: "imported",
    drive_file_id: result.brief.drive_file_id,
    drive_title: result.brief.drive_title,
    last_synced_at: result.brief.last_synced_at,
    created_by: opts.personId,
  });
  await logActivity({
    person_id: opts.personId,
    action: "working_doc_imported",
    target: result.brief.id,
    meta: { title: result.brief.drive_title },
  });
  return result;
}

export async function askSocraticForSection(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  sectionKey: WorkingSectionKey;
  priorAnswer?: string | null;
}) {
  const brief = await ensureTeamBrief(opts);
  const existing = await getOpenSocratic(brief.id, opts.sectionKey);
  if (existing && !opts.priorAnswer) return existing;

  const label = WORKING_SECTION_LABELS[opts.sectionKey];
  const sections = await listWorkingSections(brief.id);
  const filled = sections
    .filter((s) => s.body.trim())
    .map((s) => `${WORKING_SECTION_LABELS[s.section_key]}: ${s.body}`)
    .join("\n");

  const out = await runCoachSocratic({
    claimMapSummary: `Working document section: ${label}.\nCase ${opts.caseId}.\nFilled so far:\n${filled || "(empty)"}`,
    priorAnswer: opts.priorAnswer ?? null,
    personId: opts.personId,
  });

  const question =
    out.question?.trim() ||
    `For "${label}", what is the one claim a judge must hear first?`;

  return insertSocratic({
    briefId: brief.id,
    sectionKey: opts.sectionKey,
    question,
    personId: opts.personId,
  });
}

export async function answerWorkingSocratic(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  socraticId: string;
  sectionKey: WorkingSectionKey;
  answer: string;
}) {
  const answered = await answerSocratic({
    id: opts.socraticId,
    answer: opts.answer,
    personId: opts.personId,
  });
  if (!answered) throw new Error("Could not find that question.");

  const brief = await ensureTeamBrief(opts);
  const section = (await listWorkingSections(brief.id)).find(
    (s) => s.section_key === opts.sectionKey,
  );
  const nextBody = [section?.body?.trim(), opts.answer.trim()]
    .filter(Boolean)
    .join("\n\n");
  await updateWorkingSection({
    briefId: brief.id,
    sectionKey: opts.sectionKey,
    body: nextBody,
    personId: opts.personId,
  });

  // Follow-up question or evidence suggestion (asks before answering).
  const follow = await runCoachSocratic({
    claimMapSummary: `Section ${WORKING_SECTION_LABELS[opts.sectionKey]} after answer: ${opts.answer}`,
    priorAnswer: opts.answer,
    personId: opts.personId,
  });

  if (follow.hint?.trim()) {
    await insertSuggestion({
      case_id: opts.caseId,
      team_id: opts.teamId,
      brief_id: brief.id,
      kind: "evidence",
      text: follow.hint.trim(),
      citation: null,
      paragraph_anchor: null,
      section_key: opts.sectionKey,
      source: "cruxy",
      truth_item_id: null,
      created_by: opts.personId,
    });
  }

  // Next open question only if section still thin.
  const updated = await listWorkingSections(brief.id);
  const body = updated.find((s) => s.section_key === opts.sectionKey)?.body ?? "";
  if (body.trim().split(/\s+/).length < 40) {
    await askSocraticForSection({
      caseId: opts.caseId,
      teamId: opts.teamId,
      personId: opts.personId,
      sectionKey: opts.sectionKey,
      priorAnswer: opts.answer,
    });
  }

  await logActivity({
    person_id: opts.personId,
    action: "working_doc_socratic_answered",
    target: opts.socraticId,
    meta: { sectionKey: opts.sectionKey },
  });
  return answered;
}

export async function saveWorkingSectionBody(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  sectionKey: WorkingSectionKey;
  body: string;
}) {
  const brief = await ensureTeamBrief(opts);
  const row = await updateWorkingSection({
    briefId: brief.id,
    sectionKey: opts.sectionKey,
    body: opts.body,
    personId: opts.personId,
  });
  await logActivity({
    person_id: opts.personId,
    action: "working_doc_section_saved",
    target: row.id,
    meta: { sectionKey: opts.sectionKey },
  });
  // Strong section text may travel anonymously to other teams.
  if (opts.body.trim().split(/\s+/).length >= 18) {
    void import("@/lib/working-doc/idea-travel")
      .then(({ evaluateAndMaybeTravel }) =>
        evaluateAndMaybeTravel({
          caseId: opts.caseId,
          sourceTeamId: opts.teamId,
          sourceKind: "working_section",
          sourceRef: `${opts.sectionKey}:${row.id}`,
          ideaText: opts.body,
          personId: opts.personId,
        }),
      )
      .catch(() => undefined);
  }
  return row;
}

export async function tickSuggestion(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  suggestionId: string;
}) {
  const brief = await ensureTeamBrief(opts);
  const decided = await decideSuggestion({
    id: opts.suggestionId,
    status: "ticked",
    personId: opts.personId,
  });
  if (!decided) throw new Error("Could not find that suggestion.");

  const kindMap: Record<
    WorkingSuggestionRow["kind"],
    "suggestion" | "evidence" | "question" | "counter" | "inspired"
  > = {
    evidence: "evidence",
    gap: "question",
    counter: "counter",
    sharper: "suggestion",
    question: "question",
  };

  const item = await addChecklistItem({
    brief_id: brief.id,
    text: decided.citation
      ? `${decided.text} (${decided.citation})`
      : decided.text,
    kind: kindMap[decided.kind],
    created_by: opts.personId,
  });

  if (decided.truth_item_id) {
    await upsertEvidenceDecision({
      teamId: opts.teamId,
      caseId: opts.caseId,
      truthItemId: decided.truth_item_id,
      decision: "tick",
      personId: opts.personId,
    });
  }

  await logActivity({
    person_id: opts.personId,
    action: "working_doc_suggestion_ticked",
    target: decided.id,
    meta: { checklistId: item.id },
  });

  // Accepted suggestions may travel anonymously if Cruxy scores them strong.
  void import("@/lib/working-doc/idea-travel")
    .then(({ evaluateAndMaybeTravel }) =>
      evaluateAndMaybeTravel({
        caseId: opts.caseId,
        sourceTeamId: opts.teamId,
        sourceKind: "accepted_suggestion",
        sourceRef: decided.id,
        ideaText: decided.text,
        personId: opts.personId,
      }),
    )
    .catch(() => undefined);

  return { suggestion: decided, checklistItem: item };
}

export async function crossSuggestion(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  suggestionId: string;
  reason?: string | null;
}) {
  const decided = await decideSuggestion({
    id: opts.suggestionId,
    status: "crossed",
    reason: opts.reason,
    personId: opts.personId,
  });
  if (!decided) throw new Error("Could not find that suggestion.");
  if (decided.truth_item_id) {
    await upsertEvidenceDecision({
      teamId: opts.teamId,
      caseId: opts.caseId,
      truthItemId: decided.truth_item_id,
      decision: "cross",
      reason: opts.reason,
      personId: opts.personId,
    });
  }
  await logActivity({
    person_id: opts.personId,
    action: "working_doc_suggestion_crossed",
    target: decided.id,
    meta: { reason: opts.reason ?? null },
  });
  return decided;
}

export async function decideLibraryFact(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  truthItemId: string;
  decision: "tick" | "cross";
  reason?: string | null;
}) {
  const row = await upsertEvidenceDecision({
    teamId: opts.teamId,
    caseId: opts.caseId,
    truthItemId: opts.truthItemId,
    decision: opts.decision,
    reason: opts.reason,
    personId: opts.personId,
  });

  if (opts.decision === "tick") {
    const brief = await ensureTeamBrief(opts);
    const truth = (await listTruthItems({ caseId: opts.caseId })).find(
      (t) => t.id === opts.truthItemId,
    );
    if (truth) {
      await addChecklistItem({
        brief_id: brief.id,
        text: truth.text,
        kind: "evidence",
        created_by: opts.personId,
      });
    }
  }

  await logActivity({
    person_id: opts.personId,
    action:
      opts.decision === "tick"
        ? "evidence_library_ticked"
        : "evidence_library_crossed",
    target: opts.truthItemId,
    meta: { teamId: opts.teamId },
  });
  return row;
}

export async function suggestLibraryFact(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  text: string;
  citation: string;
}) {
  const fact = await insertSharedEvidenceFact({
    caseId: opts.caseId,
    teamId: opts.teamId,
    text: opts.text,
    citation: opts.citation,
    personId: opts.personId,
  });
  await logActivity({
    person_id: opts.personId,
    action: "evidence_library_fact_suggested",
    target: fact.id,
    meta: { caseId: opts.caseId },
  });
  return fact;
}

export async function getBriefForWorkingPath(
  teamId: string,
  caseId: string,
): Promise<TeamBriefRow | null> {
  return getTeamBrief(teamId, caseId);
}

/** Member tells Cruxy an idea from the working document UI (with their name). */
export async function tellIdeaFromWorkingDoc(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  text: string;
}) {
  const people = await listPeopleFull();
  const name =
    people.find((p) => p.id === opts.personId)?.name?.split(" ")[0] ??
    "A teammate";
  const cleaned = opts.text
    .trim()
    .replace(/^(i think|maybe|what if|idea:|my idea is)\s*/i, "")
    .replace(/[·—–]/g, ",");
  if (cleaned.length < 8) {
    throw new Error("Write a bit more so the team can tick or cross it.");
  }
  const brief = await ensureTeamBrief(opts);
  const suggestionText = cleaned.endsWith(".")
    ? `${name}'s idea: ${cleaned}`
    : `${name}'s idea: ${cleaned}.`;
  const sug = await insertSuggestion({
    case_id: opts.caseId,
    team_id: opts.teamId,
    brief_id: brief.id,
    kind: "sharper",
    text: suggestionText.slice(0, 500),
    citation: null,
    paragraph_anchor: null,
    section_key: null,
    source: "member",
    truth_item_id: null,
    created_by: opts.personId,
  });
  void import("@/lib/working-doc/idea-travel")
    .then(({ evaluateAndMaybeTravel }) =>
      evaluateAndMaybeTravel({
        caseId: opts.caseId,
        sourceTeamId: opts.teamId,
        sourceKind: "told_cruxy",
        sourceRef: sug.id,
        ideaText: cleaned,
        personId: opts.personId,
      }),
    )
    .catch(() => undefined);
  await logActivity({
    person_id: opts.personId,
    action: "working_doc_idea_told",
    target: sug.id,
    meta: { caseId: opts.caseId, via: "working_document" },
  });
  return sug;
}
