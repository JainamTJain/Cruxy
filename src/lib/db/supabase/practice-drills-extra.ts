/**
 * Workstream G Wave 5: drills + Q&A routing + scoring sheet versions.
 * Sample vs live dispatch; does not rewrite practice-repository.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase, assertOk } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";

export type QaQuestionKind =
  | "facts"
  | "framework_pushback"
  | "change_facts"
  | "practical";

export const QA_QUESTION_KINDS: {
  id: QaQuestionKind;
  label: string;
}[] = [
  { id: "facts", label: "Facts" },
  { id: "framework_pushback", label: "Framework pushback" },
  { id: "change_facts", label: "Change the facts" },
  { id: "practical", label: "Practical" },
];

export type QaRoutingAssignment = {
  id: string;
  team_id: string;
  question_kind: QaQuestionKind;
  person_id: string;
  updated_at: string;
  updated_by: string | null;
};

export type ScoringSheetVersion = {
  id: string;
  source_path: string;
  source_label: string;
  checksum: string;
  status: "active" | "pending" | "superseded";
  diff_summary: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
};

export type ScoringGuideSection = {
  id: string;
  sheet_version_id: string;
  kind: "band" | "guide";
  title: string;
  body: string;
  sort_ord: number;
};

export type ScoringCardItemRow = {
  id: string;
  key: string;
  label: string;
  question: string;
  sort_ord: number;
  min_score: number;
  max_score: number;
  is_total: boolean;
  sheet_version_id: string | null;
};

type SampleBag = {
  qa_routing_assignments?: QaRoutingAssignment[];
  scoring_sheet_versions?: ScoringSheetVersion[];
  scoring_guide_sections?: ScoringGuideSection[];
  scoring_card_items?: ScoringCardItemRow[];
};

const DEFAULT_SHEET: Omit<ScoringSheetVersion, "id" | "created_at"> = {
  source_path: "Training Documents/APPE IEB Fillable Scoring Sheet (August 2020)",
  source_label: "APPE IEB Fillable Scoring Sheet (August 2020)",
  checksum: "docs-domain-scoring-card-md-v1",
  status: "active",
  diff_summary: null,
  confirmed_at: "2026-11-21T00:00:00.000Z",
  confirmed_by: null,
};

const GUIDE: Omit<ScoringGuideSection, "id" | "sheet_version_id">[] = [
  {
    kind: "band",
    title: "10 Exceptional",
    body: "A+",
    sort_ord: 1,
  },
  {
    kind: "band",
    title: "9 Outstanding",
    body: "A",
    sort_ord: 2,
  },
  {
    kind: "band",
    title: "8 Very solid job",
    body: "B+ / A-",
    sort_ord: 3,
  },
  {
    kind: "band",
    title: "7 Solid job",
    body: "B",
    sort_ord: 4,
  },
  {
    kind: "band",
    title: "6 Noticeable weaknesses or omissions",
    body: "C+ / B",
    sort_ord: 5,
  },
  {
    kind: "band",
    title: "5 More serious weaknesses or omissions",
    body: "C- / C",
    sort_ord: 6,
  },
  {
    kind: "band",
    title: "3 to 4 Seriously flawed or largely absent",
    body: "D",
    sort_ord: 7,
  },
  {
    kind: "band",
    title: "1 to 2 Almost completely or completely absent",
    body: "F",
    sort_ord: 8,
  },
  {
    kind: "guide",
    title: "Presentation: clarity and organization",
    body: "Make the answer to the moderator's question clear. Keep the discussion easy to follow. Explain terms so an educated person could follow. Don't talk over each other. Judges may not score attire, appearance, volume, eye contact, or how many of us speak.",
    sort_ord: 10,
  },
  {
    kind: "guide",
    title: "Presentation: ethical analysis",
    body: "Show clear ethical reasoning that supports our position, and keep it logically plausible. Theory is optional; if we use it, explain it, and it only counts if it deepens understanding of the case. Research isn't scored for being there, only for what it adds. Judges must separate a logical flaw from disagreement with our conclusion.",
    sort_ord: 11,
  },
  {
    kind: "guide",
    title: "Presentation: alternative viewpoints",
    body: "Show there may be more than one set of reasons for our view, and reasons for other views. Don't just mention objections: show we appreciate their merits and respond thoughtfully.",
    sort_ord: 12,
  },
  {
    kind: "guide",
    title: "Commentary",
    body: "Show we listened carefully: respond to their points or note what they left out. Make a good-faith effort to understand their position accurately. Speak as a collegial conversation.",
    sort_ord: 13,
  },
  {
    kind: "guide",
    title: "Response to commentary",
    body: "Address the points we judge most pressing; we don't have to answer every point. Stay collegial.",
    sort_ord: 14,
  },
  {
    kind: "guide",
    title: "Judges' Q&A",
    body: "Each judge gets one question and one follow-up, and more if time remains. We may confer before answering. Give full but concise answers.",
    sort_ord: 15,
  },
];

async function ensureSampleSheet(): Promise<ScoringSheetVersion> {
  const store = await readStore();
  const bag = store as unknown as SampleBag;
  if (bag.scoring_sheet_versions?.some((v) => v.status === "active")) {
    return bag.scoring_sheet_versions.find((v) => v.status === "active")!;
  }
  const id = randomUUID();
  const version: ScoringSheetVersion = {
    id,
    ...DEFAULT_SHEET,
    created_at: nowIso(),
  };
  await updateStore((s) => {
    const b = s as unknown as SampleBag;
    b.scoring_sheet_versions = [version];
    b.scoring_guide_sections = GUIDE.map((g) => ({
      id: randomUUID(),
      sheet_version_id: id,
      ...g,
    }));
  });
  return version;
}

/** Claim texts for a team+case (empty array when none). */
export async function listClaimTextsForDrill(
  teamId: string,
  caseId: string,
): Promise<string[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.claims
      .filter((c) => c.team_id === teamId && c.case_id === caseId)
      .map((c) => c.text)
      .slice(0, 8);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("claims")
    .select("text")
    .eq("team_id", teamId)
    .eq("case_id", caseId)
    .limit(8);
  assertOk(error, "listClaimTextsForDrill");
  return (data ?? []).map((r) => String((r as { text: string }).text));
}

export async function listQaRouting(
  teamId: string,
): Promise<QaRoutingAssignment[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as SampleBag;
    return (bag.qa_routing_assignments ?? []).filter(
      (a) => a.team_id === teamId,
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("qa_routing_assignments")
    .select("*")
    .eq("team_id", teamId);
  assertOk(error, "listQaRouting");
  return (data ?? []) as QaRoutingAssignment[];
}

export async function upsertQaRouting(opts: {
  teamId: string;
  questionKind: QaQuestionKind;
  personId: string;
  actorId: string;
}): Promise<QaRoutingAssignment> {
  if (isSampleDataMode()) {
    let row!: QaRoutingAssignment;
    await updateStore((s) => {
      const bag = s as unknown as SampleBag;
      if (!bag.qa_routing_assignments) bag.qa_routing_assignments = [];
      const existing = bag.qa_routing_assignments.find(
        (a) =>
          a.team_id === opts.teamId && a.question_kind === opts.questionKind,
      );
      if (existing) {
        existing.person_id = opts.personId;
        existing.updated_at = nowIso();
        existing.updated_by = opts.actorId;
        row = existing;
      } else {
        row = {
          id: randomUUID(),
          team_id: opts.teamId,
          question_kind: opts.questionKind,
          person_id: opts.personId,
          updated_at: nowIso(),
          updated_by: opts.actorId,
        };
        bag.qa_routing_assignments.push(row);
      }
    });
    await logActivity({
      person_id: opts.actorId,
      action: "qa_routing_updated",
      target: opts.teamId,
      meta: { kind: opts.questionKind, personId: opts.personId },
    });
    return row;
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("qa_routing_assignments")
    .upsert(
      {
        team_id: opts.teamId,
        question_kind: opts.questionKind,
        person_id: opts.personId,
        updated_at: nowIso(),
        updated_by: opts.actorId,
      },
      { onConflict: "team_id,question_kind" },
    )
    .select("*")
    .single();
  assertOk(error, "upsertQaRouting");
  await logActivity({
    person_id: opts.actorId,
    action: "qa_routing_updated",
    target: opts.teamId,
    meta: { kind: opts.questionKind, personId: opts.personId },
  });
  return data as QaRoutingAssignment;
}

export async function getActiveScoringSheet(): Promise<{
  version: ScoringSheetVersion;
  items: ScoringCardItemRow[];
  guide: ScoringGuideSection[];
  pending: ScoringSheetVersion | null;
}> {
  if (isSampleDataMode()) {
    const version = await ensureSampleSheet();
    const store = await readStore();
    const bag = store as unknown as SampleBag;
    const guide = (bag.scoring_guide_sections ?? []).filter(
      (g) => g.sheet_version_id === version.id,
    );
    const items: ScoringCardItemRow[] = [
      {
        id: "sca",
        key: "presentation_a",
        label: "Presentation A",
        question: "Was the presentation clear and systematic?",
        sort_ord: 1,
        min_score: 1,
        max_score: 10,
        is_total: false,
        sheet_version_id: version.id,
      },
      {
        id: "scb",
        key: "presentation_b",
        label: "Presentation B",
        question:
          "Did the presentation clearly identify and thoroughly discuss the central moral dimensions of the case?",
        sort_ord: 2,
        min_score: 1,
        max_score: 10,
        is_total: false,
        sheet_version_id: version.id,
      },
      {
        id: "scc",
        key: "presentation_c",
        label: "Presentation C",
        question:
          "Did the presentation show awareness of and thoughtful consideration for different viewpoints, especially those that would weigh heavily for those who disagree?",
        sort_ord: 3,
        min_score: 1,
        max_score: 10,
        is_total: false,
        sheet_version_id: version.id,
      },
      {
        id: "sct",
        key: "presentation_total",
        label: "Presentation total",
        question: "A + B + C",
        sort_ord: 4,
        min_score: 3,
        max_score: 30,
        is_total: true,
        sheet_version_id: version.id,
      },
      {
        id: "sccom",
        key: "commentary",
        label: "Commentary",
        question: "The team's commentary on the other team's presentation",
        sort_ord: 5,
        min_score: 1,
        max_score: 10,
        is_total: false,
        sheet_version_id: version.id,
      },
      {
        id: "scr",
        key: "response_to_commentary",
        label: "Response to commentary",
        question: "The team's response to the other team's commentary",
        sort_ord: 6,
        min_score: 1,
        max_score: 10,
        is_total: false,
        sheet_version_id: version.id,
      },
      {
        id: "scj",
        key: "response_to_judges",
        label: "Response to judges",
        question: "The team's answers to the judges' questions",
        sort_ord: 7,
        min_score: 1,
        max_score: 10,
        is_total: false,
        sheet_version_id: version.id,
      },
      {
        id: "scall",
        key: "team_total",
        label: "Team total",
        question: "All of the above",
        sort_ord: 8,
        min_score: 0,
        max_score: 60,
        is_total: true,
        sheet_version_id: version.id,
      },
    ];
    const pending =
      (bag.scoring_sheet_versions ?? []).find((v) => v.status === "pending") ??
      null;
    return { version, items, guide, pending };
  }

  const sb = getServiceSupabase();
  const activeRes = await sb
    .from("scoring_sheet_versions")
    .select("*")
    .eq("status", "active")
    .maybeSingle();
  assertOk(activeRes.error, "getActiveScoringSheet.active");
  let active = activeRes.data;

  if (!active) {
    const insert = await sb
      .from("scoring_sheet_versions")
      .insert({ ...DEFAULT_SHEET })
      .select("*")
      .single();
    assertOk(insert.error, "getActiveScoringSheet.seed");
    active = insert.data;
    const guides = GUIDE.map((g) => ({
      sheet_version_id: (active as ScoringSheetVersion).id,
      ...g,
    }));
    assertOk(
      (await sb.from("scoring_guide_sections").insert(guides)).error,
      "getActiveScoringSheet.guide",
    );
  }

  const version = active as ScoringSheetVersion;
  const [itemsRes, guideRes, pendingRes] = await Promise.all([
    sb
      .from("scoring_card_items")
      .select("*")
      .order("sort_ord", { ascending: true }),
    sb
      .from("scoring_guide_sections")
      .select("*")
      .eq("sheet_version_id", version.id)
      .order("sort_ord", { ascending: true }),
    sb
      .from("scoring_sheet_versions")
      .select("*")
      .eq("status", "pending")
      .maybeSingle(),
  ]);
  assertOk(itemsRes.error, "getActiveScoringSheet.items");
  assertOk(guideRes.error, "getActiveScoringSheet.guideRead");
  assertOk(pendingRes.error, "getActiveScoringSheet.pending");

  return {
    version,
    items: (itemsRes.data ?? []) as ScoringCardItemRow[],
    guide: (guideRes.data ?? []) as ScoringGuideSection[],
    pending: (pendingRes.data as ScoringSheetVersion | null) ?? null,
  };
}

/** Simulate Librarian finding a newer Drive sheet for Jainam to confirm. */
export async function proposeNewerScoringSheet(opts: {
  actorId: string;
  sourceLabel: string;
  checksum: string;
  diffSummary: string;
}): Promise<ScoringSheetVersion> {
  if (isSampleDataMode()) {
    await ensureSampleSheet();
    let pending!: ScoringSheetVersion;
    await updateStore((s) => {
      const bag = s as unknown as SampleBag;
      if (!bag.scoring_sheet_versions) bag.scoring_sheet_versions = [];
      for (const v of bag.scoring_sheet_versions) {
        if (v.status === "pending") v.status = "superseded";
      }
      pending = {
        id: randomUUID(),
        source_path: `Training Documents/${opts.sourceLabel}`,
        source_label: opts.sourceLabel,
        checksum: opts.checksum,
        status: "pending",
        diff_summary: opts.diffSummary,
        confirmed_at: null,
        confirmed_by: null,
        created_at: nowIso(),
      };
      bag.scoring_sheet_versions.push(pending);
    });
    await logActivity({
      person_id: opts.actorId,
      action: "scoring_sheet_pending",
      target: pending.id,
      meta: { checksum: opts.checksum },
    });
    return pending;
  }

  const sb = getServiceSupabase();
  await sb
    .from("scoring_sheet_versions")
    .update({ status: "superseded" })
    .eq("status", "pending");
  const { data, error } = await sb
    .from("scoring_sheet_versions")
    .insert({
      source_path: `Training Documents/${opts.sourceLabel}`,
      source_label: opts.sourceLabel,
      checksum: opts.checksum,
      status: "pending",
      diff_summary: opts.diffSummary,
    })
    .select("*")
    .single();
  assertOk(error, "proposeNewerScoringSheet");
  await logActivity({
    person_id: opts.actorId,
    action: "scoring_sheet_pending",
    target: (data as ScoringSheetVersion).id,
    meta: { checksum: opts.checksum },
  });
  return data as ScoringSheetVersion;
}

export async function confirmScoringSheet(opts: {
  versionId: string;
  actorId: string;
  approve: boolean;
}): Promise<{ ok: true }> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as SampleBag;
      const versions = bag.scoring_sheet_versions ?? [];
      const target = versions.find((v) => v.id === opts.versionId);
      if (!target) throw new Error("Version not found");
      if (!opts.approve) {
        target.status = "superseded";
        return;
      }
      for (const v of versions) {
        if (v.status === "active") v.status = "superseded";
      }
      target.status = "active";
      target.confirmed_at = nowIso();
      target.confirmed_by = opts.actorId;
    });
  } else {
    const sb = getServiceSupabase();
    if (!opts.approve) {
      assertOk(
        (
          await sb
            .from("scoring_sheet_versions")
            .update({ status: "superseded" })
            .eq("id", opts.versionId)
        ).error,
        "confirmScoringSheet.reject",
      );
    } else {
      assertOk(
        (
          await sb
            .from("scoring_sheet_versions")
            .update({ status: "superseded" })
            .eq("status", "active")
        ).error,
        "confirmScoringSheet.supersede",
      );
      assertOk(
        (
          await sb
            .from("scoring_sheet_versions")
            .update({
              status: "active",
              confirmed_at: nowIso(),
              confirmed_by: opts.actorId,
            })
            .eq("id", opts.versionId)
        ).error,
        "confirmScoringSheet.activate",
      );
    }
  }
  await logActivity({
    person_id: opts.actorId,
    action: opts.approve ? "scoring_sheet_confirmed" : "scoring_sheet_rejected",
    target: opts.versionId,
  });
  return { ok: true };
}
