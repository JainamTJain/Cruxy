/**
 * Workstream E Wave 5: roadmap stages and readiness from real activity.
 * Keeps Track 3's roadmap.ts / repository.ts as F's; this module adds
 * practice rounds, judge cards, claim-map contributions, core reading,
 * team deadline edits, team readiness, and richer "Do next".
 */
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import {
  deadlinesFromCompetition,
  doNextActions,
  readinessForCase,
} from "@/lib/revision/roadmap";
import { flashcardStageComplete } from "@/lib/revision/flashcards";
import {
  DEFAULT_STAGE_DEADLINES,
  ROADMAP_STAGES,
  type RoadmapStage,
  type RoadmapStageId,
} from "@/lib/revision/types";
import {
  ensureRoadmapForPerson,
  getRoadmapView,
  listCasesAndTeams,
} from "@/lib/revision/repository";
import { listAssignments } from "@/lib/team/repository";
import { mapRound } from "@/lib/db/supabase/practice";
import { nowIso } from "@/lib/utils";
import { appToday } from "@/lib/time/app-day";

export type StageStatus = {
  stage: RoadmapStageId;
  done: boolean;
  /** True when there is no activity yet for this stage. */
  notStarted: boolean;
  detail: string;
};

export type DeadlineOverride = {
  id: string;
  team_id: string;
  stage: RoadmapStageId;
  due: string;
  updated_at: string;
  updated_by: string | null;
};

export type EnrichedRoadmapCase = {
  case: { id: string; number: number; title: string; active: boolean };
  stages: RoadmapStage[];
  readiness: number;
  statusByStage: Record<RoadmapStageId, StageStatus>;
  role?: string;
  tag?: string;
};

export type EnrichedRoadmapView = {
  cases: EnrichedRoadmapCase[];
  doNext: string[];
  competitionDate: string;
  deadlines: Record<RoadmapStageId, string>;
  teamDeadlinesEditable: boolean;
  teamId: string | null;
  teamReadiness: number | null;
  teamReadinessByCase: { caseId: string; pct: number }[];
  personName?: string;
  teamName?: string | null;
  overallReady: number;
  overdueCount: number;
  assignments: {
    title: string;
    by: string;
    due: string | null;
    overdue?: boolean;
    accent?: "overdue" | "redo" | "normal";
  }[];
};

type Store = Awaited<ReturnType<typeof readStore>>;

function isCoreFile(f: {
  type: string | null;
  card: string | null;
  name: string;
}): boolean {
  if (f.card && /core/i.test(f.card)) return true;
  if (/\[core\]|\bcore\b/i.test(f.name) && f.type !== "case_set") return true;
  return false;
}

function caseSetFiles(
  store: Store,
  caseId: string,
): { id: string; type: string | null; card: string | null; name: string }[] {
  return store.files.filter(
    (f) =>
      f.case_ids.includes(caseId) &&
      (f.type === "case_set" || /case set/i.test(f.name)),
  );
}

function coreFilesForCase(store: Store, caseId: string) {
  return store.files.filter(
    (f) => f.case_ids.includes(caseId) && isCoreFile(f),
  );
}

/** F-141 Read: case set + every core file ≥ 60% opened. Not started if no progress. */
export function stageReadDone(
  store: Store,
  personId: string,
  caseId: string,
): StageStatus {
  const progress = store.reading_progress.filter(
    (r) => r.person_id === personId && r.case_id === caseId,
  );
  if (progress.length === 0) {
    return {
      stage: "read",
      done: false,
      notStarted: true,
      detail: "No reading time logged yet",
    };
  }
  const needed = [
    ...caseSetFiles(store, caseId),
    ...coreFilesForCase(store, caseId),
  ];
  const uniq = new Map(needed.map((f) => [f.id, f]));
  const required = [...uniq.values()];
  if (required.length === 0) {
    // No tagged files yet: any progress ≥ 60% counts as started work only
    const ok = progress.every((p) => p.opened_ratio >= 0.6);
    return {
      stage: "read",
      done: ok && progress.length > 0,
      notStarted: false,
      detail: ok
        ? "Reading progress on file(s) for this case"
        : "Open each file to at least 60%",
    };
  }
  const byFile = new Map(progress.map((p) => [p.file_id, p.opened_ratio]));
  const missing = required.filter((f) => (byFile.get(f.id) ?? 0) < 0.6);
  return {
    stage: "read",
    done: missing.length === 0,
    notStarted: false,
    detail:
      missing.length === 0
        ? "Case set and core files opened to 60%"
        : `${missing.length} core or case-set file(s) still under 60%`,
  };
}

/** F-142 Map: contributed to or reviewed every claim on the team's map. */
export function stageMapDone(
  store: Store,
  personId: string,
  caseId: string,
): StageStatus {
  const person = store.people.find((p) => p.id === personId);
  const teamId = person?.team_id;
  const claims = store.claims.filter(
    (c) => c.case_id === caseId && (!teamId || c.team_id === teamId),
  );
  const reviews = store.map_reviews.filter(
    (m) => m.person_id === personId && m.case_id === caseId,
  );
  const contributedVersions = store.claim_map_versions.filter(
    (v) =>
      v.case_id === caseId &&
      v.created_by === personId &&
      (!teamId || v.team_id === teamId),
  );
  const proposed = store.claim_change_proposals.filter(
    (p) =>
      p.case_id === caseId &&
      p.proposed_by === personId &&
      (!teamId || p.team_id === teamId),
  );
  const logHits = store.activity_log.filter(
    (a) =>
      a.person_id === personId &&
      (a.action === "claim_map_version" ||
        a.action === "claim_edited" ||
        a.action === "map_review") &&
      (a.target === caseId ||
        (typeof a.meta?.case_id === "string" && a.meta.case_id === caseId)),
  );

  const anyActivity =
    reviews.length > 0 ||
    contributedVersions.length > 0 ||
    proposed.length > 0 ||
    logHits.length > 0;

  if (!anyActivity) {
    return {
      stage: "map",
      done: false,
      notStarted: true,
      detail: "No claim-map reviews or edits yet",
    };
  }

  if (claims.length === 0) {
    // Team claim rows empty: a published map version by this person counts
    const done =
      contributedVersions.length > 0 ||
      reviews.some((r) => r.kind === "reviewed_all");
    return {
      stage: "map",
      done,
      notStarted: false,
      detail: done
        ? "Contributed a claim-map version"
        : "Review or edit the map when claims exist",
    };
  }

  const reviewedAll = reviews.some((r) => r.kind === "reviewed_all");
  const everyClaim =
    reviewedAll ||
    claims.every(
      (c) =>
        reviews.some((r) => r.claim_id === c.id) ||
        contributedVersions.length > 0 ||
        proposed.some((p) => p.claim_key === c.id),
    );

  return {
    stage: "map",
    done: everyClaim,
    notStarted: false,
    detail: everyClaim
      ? "Every claim reviewed or contributed"
      : "Still missing a review on one or more claims",
  };
}

/** F-143 One pager (already in Track 3; mirrored for status detail). */
export function stageOnePagerDone(
  store: Store,
  personId: string,
  caseId: string,
): StageStatus {
  const person = store.people.find((p) => p.id === personId);
  const teamId = person?.team_id;
  const page = store.one_pagers
    .filter((o) => o.case_id === caseId && (!teamId || o.team_id === teamId))
    .sort((a, b) => b.version - a.version)[0];
  if (!page) {
    return {
      stage: "one_pager",
      done: false,
      notStarted: true,
      detail: "No one-pager yet",
    };
  }
  if (page.body.empty_rows.length > 0) {
    return {
      stage: "one_pager",
      done: false,
      notStarted: false,
      detail: "One-pager still has empty rows",
    };
  }
  const signed = page.signed_off_by.includes(personId);
  return {
    stage: "one_pager",
    done: signed,
    notStarted: !signed && page.signed_off_by.length === 0,
    detail: signed ? "Signed off" : "Needs your sign-off",
  };
}

/** F-144 Flashcards: 90% of deck recalled correctly twice. */
export function stageFlashcardsDone(
  store: Store,
  personId: string,
  caseId: string,
): StageStatus {
  const person = store.people.find((p) => p.id === personId);
  const teamId = person?.team_id;
  const cards = store.flashcards.filter(
    (c) => c.case_id === caseId && (!teamId || c.team_id === teamId),
  );
  const reviews = store.card_reviews.filter((r) => r.person_id === personId);
  if (cards.length === 0) {
    return {
      stage: "flashcards",
      done: false,
      notStarted: true,
      detail: "No flashcards for this case yet",
    };
  }
  const myReviews = reviews.filter((r) =>
    cards.some((c) => c.id === r.card_id),
  );
  if (myReviews.length === 0) {
    return {
      stage: "flashcards",
      done: false,
      notStarted: true,
      detail: "No card reviews yet",
    };
  }
  const done = flashcardStageComplete(
    myReviews,
    cards.map((c) => c.id),
  );
  return {
    stage: "flashcards",
    done,
    notStarted: false,
    detail: done
      ? "90% of the deck recalled correctly twice"
      : "Keep reviewing until 90% are correct twice",
  };
}

/**
 * F-145 Question drill: 10 answers, and overall average above the average of
 * your own first attempts on this case (self-history only).
 */
export function stageQuestionDrillDone(
  store: Store,
  personId: string,
  caseId: string,
): StageStatus {
  const qIds = new Set(
    store.questions
      .filter((q) => q.case_id === caseId && q.status === "active")
      .map((q) => q.id),
  );
  const answers = store.answers
    .filter((a) => a.person_id === personId && qIds.has(a.question_id))
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  if (answers.length === 0) {
    return {
      stage: "question_drill",
      done: false,
      notStarted: true,
      detail: "No bank answers yet",
    };
  }
  if (answers.length < 10) {
    return {
      stage: "question_drill",
      done: false,
      notStarted: false,
      detail: `${answers.length} of 10 answers so far`,
    };
  }
  const firstByQ = new Map<string, number>();
  for (const a of answers) {
    if (!firstByQ.has(a.question_id) && a.score != null) {
      firstByQ.set(a.question_id, a.score);
    }
  }
  const scored = answers.filter((a) => a.score != null);
  if (scored.length === 0 || firstByQ.size === 0) {
    return {
      stage: "question_drill",
      done: false,
      notStarted: false,
      detail: "Answers need scores before this stage can complete",
    };
  }
  const overall =
    scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length;
  const firstAvg =
    [...firstByQ.values()].reduce((s, n) => s + n, 0) / firstByQ.size;
  const done = overall > firstAvg;
  return {
    stage: "question_drill",
    done,
    notStarted: false,
    detail: done
      ? "10+ answers with average above your first attempts"
      : "Average is not yet above your first attempts on this case",
  };
}

/** F-146 Practiced: spoke in at least one recorded round on the case. */
export function stagePracticedDone(
  store: Store,
  personId: string,
  caseId: string,
): StageStatus {
  const logs = store.practice_speak_logs.filter(
    (p) => p.person_id === personId && p.case_id === caseId && p.spoken,
  );
  const recordedRoundIds = new Set(
    store.recordings
      .filter((r) => r.deleted_at == null && r.chunk_paths.length > 0)
      .map((r) => r.round_id),
  );
  const rounds = store.practice_rounds.filter(
    (r) =>
      r.case_id === caseId &&
      (recordedRoundIds.has(r.id) ||
        r.phase === "done" ||
        r.phase === "scoring"),
  );
  const roundIds = new Set(rounds.map((r) => r.id));
  const spokeInTranscript = store.transcript_lines.some(
    (t) =>
      t.speaker_person_id === personId &&
      roundIds.has(t.round_id) &&
      t.text.trim().length > 0,
  );
  const spokeAnalytics = store.talk_analytics.some(
    (t) => t.person_id === personId && roundIds.has(t.round_id) && t.words > 0,
  );
  const any = logs.length > 0 || spokeInTranscript || spokeAnalytics;
  if (!any) {
    return {
      stage: "practiced",
      done: false,
      notStarted: true,
      detail: "No recorded round speech yet",
    };
  }
  return {
    stage: "practiced",
    done: true,
    notStarted: false,
    detail: "Spoke in a recorded round on this case",
  };
}

/** F-147 Judged: ≥2 judge cards/attempts; latest score above earlier (self). */
export function stageJudgedDone(
  store: Store,
  personId: string,
  caseId: string,
): StageStatus {
  const attempts = store.judge_attempts
    .filter((j) => j.person_id === personId && j.case_id === caseId)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const roundIdsForCase = new Set(
    store.practice_rounds
      .filter((r) => r.case_id === caseId)
      .map((r) => r.id),
  );
  const cards = store.judge_cards
    .filter(
      (c) =>
        c.judge_id === personId &&
        roundIdsForCase.has(c.round_id) &&
        !c.cruxy,
    )
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const cardTotals = cards.map((c) => {
    const scores = store.card_scores.filter((s) => s.card_id === c.id);
    return {
      at: c.created_at,
      total: scores.reduce((n, s) => n + s.score, 0),
    };
  });

  const series =
    attempts.length >= 2
      ? attempts.map((a) => ({ at: a.created_at, total: a.score }))
      : cardTotals;

  // Also count Cruxy-assisted human judging stubs in judge_attempts only
  if (series.length === 0) {
    return {
      stage: "judged",
      done: false,
      notStarted: true,
      detail: "No judge cards or attempts yet",
    };
  }
  if (series.length < 2) {
    return {
      stage: "judged",
      done: false,
      notStarted: false,
      detail: "Judged once; need a second card to compare with your own past",
    };
  }
  const first = series[0]!.total;
  const latest = series[series.length - 1]!.total;
  const done = latest > first;
  return {
    stage: "judged",
    done,
    notStarted: false,
    detail: done
      ? "Latest judge score is above your earlier one on this case"
      : "Latest score is not yet above your earlier score on this case",
  };
}

export function evaluateStage(
  store: Store,
  personId: string,
  caseId: string,
  stage: RoadmapStageId,
): StageStatus {
  switch (stage) {
    case "read":
      return stageReadDone(store, personId, caseId);
    case "map":
      return stageMapDone(store, personId, caseId);
    case "one_pager":
      return stageOnePagerDone(store, personId, caseId);
    case "flashcards":
      return stageFlashcardsDone(store, personId, caseId);
    case "question_drill":
      return stageQuestionDrillDone(store, personId, caseId);
    case "practiced":
      return stagePracticedDone(store, personId, caseId);
    case "judged":
      return stageJudgedDone(store, personId, caseId);
  }
}

/** Persist done_at from real activity; clear when not done (honest "not started"). */
export async function recomputeStagesFromActivity(
  personId: string,
): Promise<void> {
  await ensureRoadmapForPerson(personId);
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const stages = s.roadmap_stages.filter(
        (r) =>
          r.person_id === personId &&
          ROADMAP_STAGES.includes(r.stage as RoadmapStageId),
      );
      for (const row of stages) {
        const status = evaluateStage(
          s,
          personId,
          row.case_id,
          row.stage as RoadmapStageId,
        );
        row.done_at = status.done ? row.done_at ?? nowIso() : null;
      }
    });
    return;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  // Live path: reuse sample-shaped evaluation via a thin snapshot load
  const store = await loadLiveActivitySnapshot(personId);
  const stages = store.roadmap_stages.filter(
    (r) =>
      r.person_id === personId &&
      ROADMAP_STAGES.includes(r.stage as RoadmapStageId),
  );
  const sb = getServiceSupabase();
  for (const row of stages) {
    const status = evaluateStage(
      store,
      personId,
      row.case_id,
      row.stage as RoadmapStageId,
    );
    const doneAt = status.done ? row.done_at ?? nowIso() : null;
    await sb
      .from("roadmap_stages")
      .update({ done_at: doneAt })
      .eq("id", row.id);
  }
}

async function loadLiveActivitySnapshot(personId: string): Promise<Store> {
  if (isSampleDataMode()) return readStore();
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  const [
    people,
    cases,
    roles,
    reading,
    mapReviews,
    onePagers,
    flashcards,
    cardReviews,
    questions,
    answers,
    speak,
    judgeAttempts,
    claims,
    claimMaps,
    proposals,
    rounds,
    recordings,
    transcripts,
    talk,
    judgeCards,
    cardScores,
    files,
    stages,
    activity,
    feedback,
  ] = await Promise.all([
    sb.from("people").select("*"),
    sb.from("cases").select("*"),
    sb.from("case_roles").select("*"),
    sb.from("reading_progress").select("*").eq("person_id", personId),
    sb.from("map_reviews").select("*").eq("person_id", personId),
    sb.from("one_pagers").select("*"),
    sb.from("flashcards").select("*"),
    sb.from("card_reviews").select("*").eq("person_id", personId),
    sb.from("questions").select("*"),
    sb.from("answers").select("*").eq("person_id", personId),
    sb.from("practice_speak_logs").select("*").eq("person_id", personId),
    sb.from("judge_attempts").select("*").eq("person_id", personId),
    sb.from("claims").select("*"),
    sb.from("claim_map_versions").select("*"),
    sb.from("claim_change_proposals").select("*"),
    sb.from("rounds").select("*"),
    sb.from("recordings").select("*"),
    sb.from("transcript_lines").select("*").eq("speaker_person_id", personId),
    sb.from("talk_analytics").select("*").eq("person_id", personId),
    sb.from("judge_cards").select("*").eq("judge_id", personId),
    sb.from("card_scores").select("*"),
    sb.from("files").select("*"),
    sb.from("roadmap_stages").select("*").eq("person_id", personId),
    sb.from("activity_log").select("*").eq("person_id", personId).limit(200),
    sb.from("feedback_items").select("*").eq("person_id", personId),
  ]);

  return {
    people: (people.data as Store["people"]) ?? [],
    cases: (cases.data as Store["cases"]) ?? [],
    case_roles: (roles.data as Store["case_roles"]) ?? [],
    reading_progress: (reading.data as Store["reading_progress"]) ?? [],
    map_reviews: (mapReviews.data as Store["map_reviews"]) ?? [],
    one_pagers: (onePagers.data as Store["one_pagers"]) ?? [],
    flashcards: (flashcards.data as Store["flashcards"]) ?? [],
    card_reviews: (cardReviews.data as Store["card_reviews"]) ?? [],
    questions: (questions.data as Store["questions"]) ?? [],
    answers: (answers.data as Store["answers"]) ?? [],
    practice_speak_logs: (speak.data as Store["practice_speak_logs"]) ?? [],
    judge_attempts: (judgeAttempts.data as Store["judge_attempts"]) ?? [],
    claims: (claims.data as Store["claims"]) ?? [],
    claim_map_versions: (claimMaps.data as Store["claim_map_versions"]) ?? [],
    claim_change_proposals:
      (proposals.data as Store["claim_change_proposals"]) ?? [],
    practice_rounds: ((rounds.data ?? []) as Record<string, unknown>[]).map(
      (r) => mapRound(r),
    ) as Store["practice_rounds"],
    recordings: (recordings.data as Store["recordings"]) ?? [],
    transcript_lines: (transcripts.data as Store["transcript_lines"]) ?? [],
    talk_analytics: (talk.data as Store["talk_analytics"]) ?? [],
    judge_cards: (judgeCards.data as Store["judge_cards"]) ?? [],
    card_scores: (cardScores.data as Store["card_scores"]) ?? [],
    files: (files.data as Store["files"]) ?? [],
    roadmap_stages: (stages.data as Store["roadmap_stages"]) ?? [],
    activity_log: (activity.data as Store["activity_log"]) ?? [],
    feedback_items: (feedback.data as Store["feedback_items"]) ?? [],
    teams: [],
    competitions: [],
  } as unknown as Store;
}

export async function listDeadlineOverrides(
  teamId: string,
): Promise<DeadlineOverride[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.roadmap_deadline_overrides ?? [])
      .filter((o) => o.team_id === teamId)
      .map((o) => ({
        ...o,
        stage: o.stage as RoadmapStageId,
      }));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data, error } = await getServiceSupabase()
    .from("roadmap_deadline_overrides")
    .select("*")
    .eq("team_id", teamId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    team_id: r.team_id as string,
    stage: r.stage as RoadmapStageId,
    due: String(r.due).slice(0, 10),
    updated_at: r.updated_at as string,
    updated_by: (r.updated_by as string | null) ?? null,
  }));
}

/** F-149–F-156: team can edit recommended deadlines. */
export async function setTeamDeadlineOverrides(input: {
  teamId: string;
  personId: string;
  dues: Partial<Record<RoadmapStageId, string>>;
}): Promise<DeadlineOverride[]> {
  const rows: DeadlineOverride[] = [];
  for (const stage of ROADMAP_STAGES) {
    const due = input.dues[stage];
    if (!due) continue;
    rows.push({
      id: randomUUID(),
      team_id: input.teamId,
      stage,
      due: due.slice(0, 10),
      updated_at: nowIso(),
      updated_by: input.personId,
    });
  }

  if (isSampleDataMode()) {
    await updateStore((s) => {
      s.roadmap_deadline_overrides = s.roadmap_deadline_overrides ?? [];
      for (const row of rows) {
        const i = s.roadmap_deadline_overrides.findIndex(
          (o) => o.team_id === row.team_id && o.stage === row.stage,
        );
        if (i >= 0) {
          s.roadmap_deadline_overrides[i] = {
            ...s.roadmap_deadline_overrides[i],
            due: row.due,
            updated_at: row.updated_at,
            updated_by: row.updated_by,
          };
        } else {
          s.roadmap_deadline_overrides.push(row);
        }
      }
      // Apply to all team members' roadmap stage dues
      const memberIds = new Set(
        s.people.filter((p) => p.team_id === input.teamId).map((p) => p.id),
      );
      for (const stage of s.roadmap_stages) {
        if (!memberIds.has(stage.person_id)) continue;
        const ov = rows.find((r) => r.stage === stage.stage);
        if (ov) stage.due = ov.due;
      }
    });
    return listDeadlineOverrides(input.teamId);
  }

  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  for (const row of rows) {
    await sb.from("roadmap_deadline_overrides").upsert(
      {
        team_id: row.team_id,
        stage: row.stage,
        due: row.due,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      },
      { onConflict: "team_id,stage" },
    );
    // Update member stages
    const { data: members } = await sb
      .from("people")
      .select("id")
      .eq("team_id", input.teamId);
    const ids = (members ?? []).map((m) => m.id as string);
    if (ids.length) {
      await sb
        .from("roadmap_stages")
        .update({ due: row.due })
        .eq("stage", row.stage)
        .in("person_id", ids);
    }
  }
  return listDeadlineOverrides(input.teamId);
}

function resolveDeadlines(
  competitionDate: string,
  overrides: DeadlineOverride[],
): Record<RoadmapStageId, string> {
  const base =
    competitionDate === "2026-12-05"
      ? { ...DEFAULT_STAGE_DEADLINES }
      : deadlinesFromCompetition(competitionDate);
  for (const o of overrides) {
    base[o.stage] = o.due;
  }
  return base;
}

/** F-158: readiness per case (weighted) and per team from member stages. */
export async function computeTeamReadiness(teamId: string): Promise<{
  overall: number;
  byCase: { caseId: string; pct: number; leadNames: string[] }[];
}> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const members = store.people.filter((p) => p.team_id === teamId);
    const active = store.cases.filter((c) => c.active);
    const byCase: { caseId: string; pct: number; leadNames: string[] }[] = [];
    for (const c of active) {
      const pcts: number[] = [];
      for (const m of members) {
        const stages = store.roadmap_stages.filter(
          (r) =>
            r.person_id === m.id &&
            r.case_id === c.id &&
            ROADMAP_STAGES.includes(r.stage as RoadmapStageId),
        ) as RoadmapStage[];
        if (stages.length) pcts.push(readinessForCase(stages));
      }
      const leadNames = store.case_roles
        .filter(
          (r) =>
            r.team_id === teamId &&
            r.case_id === c.id &&
            (r.role === "lead_1" || r.role === "lead_2"),
        )
        .map((r) => store.people.find((p) => p.id === r.person_id)?.name)
        .filter((n): n is string => Boolean(n));
      byCase.push({
        caseId: c.id,
        pct: pcts.length
          ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
          : 0,
        leadNames,
      });
    }
    // Persist into readiness cells (sample)
    await updateStore((s) => {
      for (const row of byCase) {
        const i = s.readiness.findIndex(
          (r) => r.team_id === teamId && r.case_id === row.caseId,
        );
        const cell = {
          id: i >= 0 ? s.readiness[i]!.id : randomUUID(),
          team_id: teamId,
          case_id: row.caseId,
          readiness_pct: row.pct,
          lead_names: row.leadNames,
          latest_event: null as string | null,
          updated_at: nowIso(),
        };
        if (i >= 0) s.readiness[i] = { ...s.readiness[i]!, ...cell };
        else s.readiness.push(cell);
      }
    });
    const overall = byCase.length
      ? Math.round(byCase.reduce((s, c) => s + c.pct, 0) / byCase.length)
      : 0;
    return { overall, byCase };
  }

  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  const { data: members } = await sb
    .from("people")
    .select("id,name")
    .eq("team_id", teamId);
  const { data: cases } = await sb.from("cases").select("id").eq("active", true);
  const { data: stages } = await sb
    .from("roadmap_stages")
    .select("*")
    .in(
      "person_id",
      (members ?? []).map((m) => m.id),
    );
  const { data: roles } = await sb
    .from("case_roles")
    .select("*")
    .eq("team_id", teamId);

  const byCase: { caseId: string; pct: number; leadNames: string[] }[] = [];
  for (const c of cases ?? []) {
    const caseId = c.id as string;
    const pcts: number[] = [];
    for (const m of members ?? []) {
      const personStages = (stages ?? []).filter(
        (r) => r.person_id === m.id && r.case_id === caseId,
      ) as RoadmapStage[];
      if (personStages.length) pcts.push(readinessForCase(personStages));
    }
    const leadNames = (roles ?? [])
      .filter(
        (r) =>
          r.case_id === caseId &&
          (r.role === "lead_1" || r.role === "lead_2"),
      )
      .map((r) => {
        const p = (members ?? []).find((m) => m.id === r.person_id);
        return (p?.name as string) ?? "";
      })
      .filter(Boolean);
    const pct = pcts.length
      ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
      : 0;
    byCase.push({ caseId, pct, leadNames });
    await sb.from("readiness_cells").upsert(
      {
        team_id: teamId,
        case_id: caseId,
        readiness_pct: pct,
        lead_names: leadNames,
        updated_at: nowIso(),
      },
      { onConflict: "team_id,case_id" },
    );
  }
  const overall = byCase.length
    ? Math.round(byCase.reduce((s, c) => s + c.pct, 0) / byCase.length)
    : 0;
  return { overall, byCase };
}

/**
 * F-159 Do next: overdue stages, weak feedback areas, and open assignments.
 */
export function buildDoNext(input: {
  stages: RoadmapStage[];
  caseTitles: Map<string, string>;
  assignments: { task: string; due: string | null; status: string }[];
  weakFeedback: { caseId: string; note: string }[];
  limit?: number;
}): string[] {
  const limit = input.limit ?? 3;
  const fromStages = doNextActions(input.stages, input.caseTitles, limit);
  const out: string[] = [...fromStages];
  for (const w of input.weakFeedback) {
    if (out.length >= limit) break;
    const title = input.caseTitles.get(w.caseId) ?? "a case";
    out.push(`Drill the weak spot on ${title}: ${w.note}`);
  }
  for (const a of input.assignments.filter((x) => x.status === "open")) {
    if (out.length >= limit) break;
    const overdue =
      a.due && a.due < appToday()
        ? " (overdue)"
        : "";
    out.push(`${a.task}${overdue}`);
  }
  return out.slice(0, limit);
}

export async function getEnrichedRoadmapView(input: {
  personId: string;
  name: string;
  teamId: string | null;
}): Promise<EnrichedRoadmapView> {
  await recomputeStagesFromActivity(input.personId);
  const [view, meta, assignments, personStore] = await Promise.all([
    getRoadmapView(input.personId),
    listCasesAndTeams(),
    listAssignments({ personId: input.personId }).catch(() => []),
    isSampleDataMode() ? readStore() : loadLiveActivitySnapshot(input.personId),
  ]);

  const overrides = input.teamId
    ? await listDeadlineOverrides(input.teamId)
    : [];
  const deadlines = resolveDeadlines(view.competitionDate, overrides);

  // Apply dues onto stages for display
  const cases: EnrichedRoadmapCase[] = [];
  let overdueCount = 0;
  const today = nowIso().slice(0, 10);
  const allStages: RoadmapStage[] = [];

  for (const row of view.cases) {
    const statusByStage = {} as Record<RoadmapStageId, StageStatus>;
    const stages = row.stages.map((s) => {
      const due = deadlines[s.stage] ?? s.due;
      const status = evaluateStage(
        personStore,
        input.personId,
        row.case.id,
        s.stage,
      );
      statusByStage[s.stage] = status;
      const next: RoadmapStage = {
        ...s,
        due,
        done_at: status.done ? s.done_at ?? nowIso() : null,
      };
      if (next.required && !next.done_at && next.due && next.due < today) {
        overdueCount += 1;
      }
      return next;
    });
    allStages.push(...stages);
    cases.push({
      case: row.case,
      stages,
      readiness: readinessForCase(stages),
      statusByStage,
    });
  }

  const caseTitles = new Map(
    cases.map((c) => [
      c.case.id,
      `${String(c.case.number).padStart(2, "0")} ${c.case.title}`,
    ]),
  );

  const weakFeedback: { caseId: string; note: string }[] = [];
  if (isSampleDataMode() || personStore.feedback_items?.length) {
    for (const f of personStore.feedback_items ?? []) {
      if (f.person_id !== input.personId || f.kind !== "fix") continue;
      const round = personStore.practice_rounds.find((r) => r.id === f.round_id);
      if (!round?.case_id) continue;
      weakFeedback.push({
        caseId: round.case_id,
        note: f.scoring_item ?? f.reasoning.slice(0, 80),
      });
    }
  }

  const doNextBase = buildDoNext({
    stages: allStages,
    caseTitles,
    assignments: assignments.map((a) => ({
      task: a.task,
      due: a.due,
      status: a.status,
    })),
    weakFeedback,
    limit: 3,
  });

  // Wave 8 D: lean toward the person's weakest APPE item (personal only).
  let doNext = doNextBase;
  try {
    const { weakestAppeItemForPerson } = await import(
      "@/lib/learning/profile"
    );
    const weak = await weakestAppeItemForPerson(input.personId);
    if (weak) {
      const lean =
        weak.source === "feedback"
          ? `Practice ${weak.label}: recent feedback flagged it often.`
          : `Practice ${weak.label}: your baseline self-rating is lowest there.`;
      doNext = [lean, ...doNextBase.filter((x) => x !== lean)].slice(0, 3);
    }
  } catch {
    /* profile optional */
  }

  let teamReadiness: number | null = null;
  let teamReadinessByCase: { caseId: string; pct: number }[] = [];
  if (input.teamId) {
    const team = await computeTeamReadiness(input.teamId);
    teamReadiness = team.overall;
    teamReadinessByCase = team.byCase.map((c) => ({
      caseId: c.caseId,
      pct: c.pct,
    }));
  }

  const rolesByCase = new Map<string, string>();
  for (const r of meta.case_roles ?? []) {
    if (r.person_id !== input.personId) continue;
    const label =
      r.role === "lead_1"
        ? "Lead 1"
        : r.role === "lead_2"
          ? "Lead 2"
          : r.role === "counter_arguer"
            ? "Counter-arguer"
            : r.role === "supporter"
              ? "Supporter"
              : r.role;
    rolesByCase.set(r.case_id, label);
  }

  const peopleById = new Map(
    (meta.people ?? []).map((p: { id: string; name: string }) => [p.id, p.name]),
  );
  const team = (meta.teams ?? []).find(
    (t: { id: string }) => t.id === input.teamId,
  );

  const overallReady = cases.length
    ? Math.round(cases.reduce((s, c) => s + c.readiness, 0) / cases.length)
    : 0;

  return {
    cases: cases.map((c) => ({
      ...c,
      role: rolesByCase.get(c.case.id),
    })),
    doNext,
    competitionDate: view.competitionDate,
    deadlines,
    teamDeadlinesEditable: Boolean(input.teamId),
    teamId: input.teamId,
    teamReadiness,
    teamReadinessByCase,
    personName: input.name,
    teamName: team?.name ?? null,
    overallReady,
    overdueCount,
    assignments: assignments
      .filter((a) => a.status === "open")
      .map((a) => ({
        title: a.task,
        by: a.assigned_by
          ? `by ${peopleById.get(a.assigned_by) ?? "teammate"}`
          : "assigned to you",
        due: a.due,
        overdue: Boolean(a.due && a.due < today),
        accent: (a.due && a.due < today
          ? "overdue"
          : /redo/i.test(a.task)
            ? "redo"
            : "normal") as "overdue" | "redo" | "normal",
      })),
  };
}
