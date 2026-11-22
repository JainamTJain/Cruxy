import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import * as sb from "@/lib/db/supabase/revision";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { createEmptyCard, reviewCard, type FsrsRating } from "@/lib/revision/fsrs";
import {
  flashcardStageComplete,
  syncFlashcardsFromTruth,
} from "@/lib/revision/flashcards";
import {
  pickWeightedQuestion,
} from "@/lib/revision/moderator-bank";
import {
  caseIdForPastePart,
  splitPasteWithCruxy,
} from "@/lib/revision/moderator-paste";
import { cruxyLanguageSuggestions } from "@/lib/revision/language";
import {
  cruxySocraticAfterAnswer,
  cruxySocraticOpening,
} from "@/lib/revision/socratic";
import {
  computeRobustnessFromStore,
  listAnswersForQuestionSample,
} from "@/lib/revision/question-bank-extra";
import { diffOnePagerBodies, draftOnePagerBody } from "@/lib/revision/one-pager";
import {
  buildRoadmapForPerson,
  doNextActions,
  readinessForCase,
} from "@/lib/revision/roadmap";
import type {
  CardFsrsState,
  CaseRoleRow,
  Flashcard,
  ModeratorQuestion,
  NodeMastery,
  OnePager,
  OnePagerBody,
  PhrasebookEntry,
  QuestionAnswer,
  QuestionOrigin,
  RoadmapStage,
  RoadmapStageId,
  SocraticSession,
  TruthItem,
} from "@/lib/revision/types";
import { nowIso } from "@/lib/utils";

// ---------- Truth items + flashcard sync ----------

export async function listTruthItems(filter?: {
  teamId?: string;
  caseId?: string;
}): Promise<TruthItem[]> {
  if (!isSampleDataMode()) return sb.listTruthItems(filter);
  const store = await readStore();
  return store.truth_items.filter((t) => {
    if (filter?.teamId && t.team_id !== filter.teamId) return false;
    if (filter?.caseId && t.case_id !== filter.caseId) return false;
    return true;
  });
}

export async function updateTruthItemText(
  truthItemId: string,
  text: string,
  personId: string | null,
): Promise<{ item: TruthItem; flashcard: Flashcard | null }> {
  if (!isSampleDataMode()) return sb.updateTruthItemText(truthItemId, text, personId);
  let item!: TruthItem;
  let linkedCardId: string | null = null;

  await updateStore((s) => {
    const idx = s.truth_items.findIndex((t) => t.id === truthItemId);
    if (idx < 0) throw new Error("truth item not found");
    s.truth_items[idx] = {
      ...s.truth_items[idx],
      text,
      updated_at: nowIso(),
    };
    item = s.truth_items[idx];

    const synced = syncFlashcardsFromTruth(
      s.truth_items.filter(
        (t) => t.team_id === item.team_id && t.case_id === item.case_id,
      ),
      s.flashcards.filter(
        (c) => c.team_id === item.team_id && c.case_id === item.case_id,
      ),
    );
    // Replace case/team cards, keep others
    s.flashcards = [
      ...s.flashcards.filter(
        (c) => !(c.team_id === item.team_id && c.case_id === item.case_id),
      ),
      ...synced.cards,
    ];
    linkedCardId =
      s.flashcards.find((c) => c.truth_item_id === truthItemId)?.id ?? null;
  });

  await logActivity({
    person_id: personId,
    action: "truth_item_updated",
    target: truthItemId,
    meta: { flashcard_id: linkedCardId },
  });

  const storeAfter = await readStore();
  const flashcard =
    storeAfter.flashcards.find((c) => c.id === linkedCardId) ?? null;
  return { item, flashcard };
}

export async function ensureFlashcardsForTeamCase(
  teamId: string,
  caseId: string,
): Promise<Flashcard[]> {
  if (!isSampleDataMode()) return sb.ensureFlashcardsForTeamCase(teamId, caseId);
  let cards: Flashcard[] = [];
  await updateStore((s) => {
    const truth = s.truth_items.filter(
      (t) => t.team_id === teamId && t.case_id === caseId,
    );
    const existing = s.flashcards.filter(
      (c) => c.team_id === teamId && c.case_id === caseId,
    );
    const synced = syncFlashcardsFromTruth(truth, existing);
    s.flashcards = [
      ...s.flashcards.filter(
        (c) => !(c.team_id === teamId && c.case_id === caseId),
      ),
      ...synced.cards,
    ];
    cards = synced.cards;
  });
  return cards;
}

export async function listFlashcards(filter?: {
  teamId?: string;
  caseId?: string;
  personId?: string;
}): Promise<Flashcard[]> {
  if (!isSampleDataMode()) return sb.listFlashcards(filter);
  const store = await readStore();
  let cards = store.flashcards;
  if (filter?.teamId) cards = cards.filter((c) => c.team_id === filter.teamId);
  if (filter?.caseId) cards = cards.filter((c) => c.case_id === filter.caseId);
  return cards;
}

export async function optInDeck(args: {
  personId: string;
  teamId: string;
  caseId: string;
  assigned?: boolean;
}) {
  if (!isSampleDataMode()) return sb.optInDeck(args);
  await updateStore((s) => {
    const i = s.deck_opt_ins.findIndex(
      (d) => d.person_id === args.personId && d.case_id === args.caseId,
    );
    const row = {
      id: i >= 0 ? s.deck_opt_ins[i].id : randomUUID(),
      person_id: args.personId,
      team_id: args.teamId,
      case_id: args.caseId,
      assigned: args.assigned ?? false,
      created_at: i >= 0 ? s.deck_opt_ins[i].created_at : nowIso(),
    };
    if (i >= 0) s.deck_opt_ins[i] = row;
    else s.deck_opt_ins.push(row);
  });
  await ensureRoadmapForPerson(args.personId);
  await recomputeRoadmapStages(args.personId);
}

export async function autoAssignLeadDecks(personId: string) {
  if (!isSampleDataMode()) return sb.autoAssignLeadDecks(personId);
  const store = await readStore();
  const person = store.people.find((p) => p.id === personId);
  if (!person?.team_id) return;
  const leadRoles = store.case_roles.filter(
    (r) =>
      r.person_id === personId &&
      (r.role === "lead_1" || r.role === "lead_2"),
  );
  for (const role of leadRoles) {
    await optInDeck({
      personId,
      teamId: role.team_id,
      caseId: role.case_id,
      assigned: true,
    });
    await ensureFlashcardsForTeamCase(role.team_id, role.case_id);
  }
}

export async function getOrCreateFsrsState(
  personId: string,
  cardId: string,
): Promise<CardFsrsState> {
  if (!isSampleDataMode()) return sb.getOrCreateFsrsState(personId, cardId);
  let state!: CardFsrsState;
  await updateStore((s) => {
    const existing = s.card_fsrs_states.find(
      (c) => c.person_id === personId && c.card_id === cardId,
    );
    if (existing) {
      state = existing;
      return;
    }
    const empty = createEmptyCard();
    state = {
      id: randomUUID(),
      person_id: personId,
      card_id: cardId,
      due: empty.due.toISOString(),
      stability: empty.stability,
      difficulty: empty.difficulty,
      elapsed_days: empty.elapsed_days,
      scheduled_days: empty.scheduled_days,
      reps: empty.reps,
      lapses: empty.lapses,
      state: empty.state,
      last_review: null,
      correct_streak: 0,
      pinned: false,
      created_at: nowIso(),
    };
    s.card_fsrs_states.push(state);
  });
  return state;
}

export async function reviewFlashcard(args: {
  personId: string;
  cardId: string;
  grade: FsrsRating;
  mode?: "typed" | "spoken";
}): Promise<{ state: CardFsrsState; mastery: NodeMastery | null }> {
  if (!isSampleDataMode()) return sb.reviewFlashcard(args);
  const prior = await getOrCreateFsrsState(args.personId, args.cardId);
  const next = reviewCard(
    {
      due: new Date(prior.due),
      stability: prior.stability,
      difficulty: prior.difficulty,
      elapsed_days: prior.elapsed_days,
      scheduled_days: prior.scheduled_days,
      reps: prior.reps,
      lapses: prior.lapses,
      state: prior.state,
      last_review: prior.last_review ? new Date(prior.last_review) : null,
    },
    args.grade,
  );

  await updateStore((s) => {
    const i = s.card_fsrs_states.findIndex((c) => c.id === prior.id);
    const streak =
      args.grade >= 3 ? (prior.correct_streak || 0) + 1 : 0;
    const row: CardFsrsState = {
      ...prior,
      due: next.due.toISOString(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsed_days: next.elapsed_days,
      scheduled_days: next.scheduled_days,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      last_review: next.last_review?.toISOString() ?? nowIso(),
      correct_streak: streak,
      pinned: prior.pinned ?? false,
    };
    if (i >= 0) s.card_fsrs_states[i] = row;
    s.card_reviews.push({
      id: randomUUID(),
      person_id: args.personId,
      card_id: args.cardId,
      grade: args.grade,
      next_due: row.due,
      mode: args.mode ?? "typed",
      created_at: nowIso(),
      created_by: args.personId,
    });
  });

  const { updateNodeMasteryAfterReview } = await import(
    "@/lib/db/supabase/graph-flashcards"
  );
  const mastery = await updateNodeMasteryAfterReview({
    personId: args.personId,
    cardId: args.cardId,
    grade: args.grade,
  });

  await recomputeRoadmapStages(args.personId);

  const storeAfter = await readStore();
  const card = storeAfter.flashcards.find((c) => c.id === args.cardId);
  if (card?.case_id) {
    const { observeClaimAttempt } = await import(
      "@/lib/cruxy/socratic-outcomes"
    );
    await observeClaimAttempt({
      personId: args.personId,
      caseId: card.case_id,
      attemptKind: "flashcard",
      scoreAfter: args.grade,
      refId: args.cardId,
    }).catch(() => undefined);
  }

  const state = await getOrCreateFsrsState(args.personId, args.cardId);
  return { state, mastery };
}

export async function setFlashcardPinned(args: {
  personId: string;
  cardId: string;
  pinned: boolean;
}): Promise<CardFsrsState> {
  if (!isSampleDataMode()) {
    const { setFlashcardPinned: sbPin } = await import(
      "@/lib/db/supabase/revision-extra"
    );
    return sbPin(args);
  }
  const prior = await getOrCreateFsrsState(args.personId, args.cardId);
  await updateStore((s) => {
    const i = s.card_fsrs_states.findIndex((c) => c.id === prior.id);
    if (i >= 0) {
      s.card_fsrs_states[i] = { ...s.card_fsrs_states[i]!, pinned: args.pinned };
    }
  });
  return getOrCreateFsrsState(args.personId, args.cardId);
}

export async function dueDeckForPerson(personId: string) {
  const { dueGraphDeckForPerson } = await import(
    "@/lib/db/supabase/graph-flashcards"
  );
  return dueGraphDeckForPerson(personId);
}

export async function dueFlashcardsForPerson(personId: string) {
  const deck = await dueDeckForPerson(personId);
  return deck.cards;
}

// ---------- One pagers ----------

export async function draftOnePager(args: {
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<OnePager> {
  if (!isSampleDataMode()) return sb.draftOnePager(args);
  const store = await readStore();
  const caseRow = store.cases.find((c) => c.id === args.caseId);
  const body = draftOnePagerBody({
    claims: store.claims.filter(
      (c) => c.team_id === args.teamId && c.case_id === args.caseId,
    ),
    supports: store.supports.filter(
      (c) => c.team_id === args.teamId && c.case_id === args.caseId,
    ),
    counterclaims: store.counterclaims.filter(
      (c) => c.team_id === args.teamId && c.case_id === args.caseId,
    ),
    truthItems: store.truth_items.filter(
      (c) => c.team_id === args.teamId && c.case_id === args.caseId,
    ),
    caseTitle: caseRow?.title ?? "Case",
  });

  // Call coach agent (stub ok)
  await callCruxy({
    feature: "one_pager_draft",
    tier: "small",
    messages: [
      {
        role: "user",
        content: `Draft one pager for case ${caseRow?.number ?? ""}`,
      },
    ],
    personId: args.personId,
  });

  let created!: OnePager;
  await updateStore((s) => {
    const versions = s.one_pagers.filter(
      (o) => o.team_id === args.teamId && o.case_id === args.caseId,
    );
    const version = versions.length
      ? Math.max(...versions.map((v) => v.version)) + 1
      : 1;
    const prev = versions.sort((a, b) => b.version - a.version)[0] ?? null;
    created = {
      id: randomUUID(),
      team_id: args.teamId,
      case_id: args.caseId,
      version,
      body,
      previous_body: prev?.body ?? null,
      change_note: prev ? "Cruxy re-draft on request" : "Initial Cruxy draft",
      signed_off_by: [],
      drive_doc_id: null,
      drive_pdf_exported: false,
      origin_tag: "Cruxy",
      created_at: nowIso(),
      created_by: args.personId,
    };
    s.one_pagers.push(created);
  });

  await logActivity({
    person_id: args.personId,
    action: "one_pager_drafted",
    target: created.id,
  });
  return created;
}

export async function saveOnePagerEdit(args: {
  onePagerId: string;
  body: OnePagerBody;
  changeNote: string;
  personId: string;
}): Promise<OnePager> {
  if (!isSampleDataMode()) return sb.saveOnePagerEdit(args);
  let next!: OnePager;
  await updateStore((s) => {
    const cur = s.one_pagers.find((o) => o.id === args.onePagerId);
    if (!cur) throw new Error("one pager not found");
    next = {
      id: randomUUID(),
      team_id: cur.team_id,
      case_id: cur.case_id,
      version: cur.version + 1,
      body: args.body,
      previous_body: cur.body,
      change_note: args.changeNote,
      signed_off_by: [],
      drive_doc_id: null,
      drive_pdf_exported: false,
      origin_tag: "member",
      created_at: nowIso(),
      created_by: args.personId,
    };
    s.one_pagers.push(next);
  });
  await recomputeRoadmapStages(args.personId);
  return next;
}

export async function signOffOnePager(args: {
  onePagerId: string;
  personId: string;
}) {
  if (!isSampleDataMode()) return sb.signOffOnePager(args);
  await updateStore((s) => {
    const cur = s.one_pagers.find((o) => o.id === args.onePagerId);
    if (!cur) throw new Error("one pager not found");
    if (!cur.signed_off_by.includes(args.personId)) {
      cur.signed_off_by.push(args.personId);
    }
  });
  await recomputeRoadmapStages(args.personId);
}

export async function exportOnePagerStub(onePagerId: string, personId: string) {
  if (!isSampleDataMode()) return sb.exportOnePagerStub(onePagerId, personId);
  // Drive export is stub until DRIVE_ROOT_FOLDER_ID + SA are wired
  const docId = `stub-doc-${onePagerId.slice(0, 8)}`;
  await updateStore((s) => {
    const cur = s.one_pagers.find((o) => o.id === onePagerId);
    if (!cur) throw new Error("one pager not found");
    cur.drive_doc_id = docId;
    cur.drive_pdf_exported = true;
  });
  await logActivity({
    person_id: personId,
    action: "one_pager_drive_export_stub",
    target: onePagerId,
    meta: { drive_doc_id: docId },
  });
  return { drive_doc_id: docId, pdf: true, stub: true };
}

export async function latestOnePager(teamId: string, caseId: string) {
  if (!isSampleDataMode()) return sb.latestOnePager(teamId, caseId);
  const store = await readStore();
  return (
    store.one_pagers
      .filter((o) => o.team_id === teamId && o.case_id === caseId)
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

export async function getOnePagerById(
  onePagerId: string,
): Promise<OnePager | null> {
  if (!isSampleDataMode()) return sb.getOnePagerById(onePagerId);
  const store = await readStore();
  return store.one_pagers.find((o) => o.id === onePagerId) ?? null;
}

export async function listOnePagerVersions(
  teamId: string,
  caseId: string,
): Promise<OnePager[]> {
  if (!isSampleDataMode()) return sb.listOnePagerVersions(teamId, caseId);
  const store = await readStore();
  return store.one_pagers
    .filter((o) => o.team_id === teamId && o.case_id === caseId)
    .sort((a, b) => b.version - a.version);
}

export async function onePagerDiff(onePagerId: string) {
  if (!isSampleDataMode()) return sb.onePagerDiff(onePagerId);
  const store = await readStore();
  const page = store.one_pagers.find((o) => o.id === onePagerId);
  if (!page) return [];
  return diffOnePagerBodies(page.previous_body, page.body);
}

// ---------- Moderator bank ----------

export async function pasteModeratorQuestions(args: {
  raw: string;
  caseId: string | null;
  personId: string;
  origin?: QuestionOrigin;
}): Promise<ModeratorQuestion[]> {
  if (!isSampleDataMode()) return sb.pasteModeratorQuestions(args);

  const store = await readStore();
  const catalog = store.cases.map((c) => ({
    id: c.id,
    number: c.number,
    title: c.title,
  }));
  const fallbackCase =
    args.caseId ??
    store.cases.find((c) => c.active)?.id ??
    store.cases[0]?.id;
  if (!fallbackCase) throw new Error("no cases");

  const parts = await splitPasteWithCruxy({
    raw: args.raw,
    personId: args.personId,
    caseCatalog: catalog,
    defaultCaseId: fallbackCase,
  });
  if (parts.length === 0) return [];

  const person = store.people.find((p) => p.id === args.personId);
  const origin: QuestionOrigin = args.origin ?? "dr_b";
  const origin_label =
    origin === "dr_b"
      ? "Dr. B"
      : origin === "cruxy"
        ? "Cruxy"
        : person?.name ?? "member";

  const created: ModeratorQuestion[] = [];
  await updateStore((s) => {
    for (const part of parts) {
      const q: ModeratorQuestion = {
        id: randomUUID(),
        case_id: caseIdForPastePart(part, catalog, fallbackCase),
        text: part.text,
        type: part.type,
        difficulty: part.difficulty,
        origin,
        origin_label,
        status: "pending_confirm",
        asked_at_tag: null,
        created_at: nowIso(),
        created_by: args.personId,
      };
      s.questions.push(q);
      created.push(q);
    }
  });

  await logActivity({
    person_id: args.personId,
    action: "moderator_paste_split",
    target: fallbackCase,
    meta: { count: created.length },
  });

  return created;
}

export async function confirmModeratorQuestions(args: {
  questionIds: string[];
  personId: string;
  rejectIds?: string[];
}) {
  if (!isSampleDataMode()) return sb.confirmModeratorQuestions(args);
  await updateStore((s) => {
    for (const id of args.questionIds) {
      const q = s.questions.find((x) => x.id === id);
      if (q) q.status = "active";
    }
    for (const id of args.rejectIds ?? []) {
      const q = s.questions.find((x) => x.id === id);
      if (q) q.status = "rejected";
    }
  });
}

export async function listQuestions(filter?: {
  caseId?: string;
  status?: ModeratorQuestion["status"];
}) {
  if (!isSampleDataMode()) return sb.listQuestions(filter);
  const store = await readStore();
  return store.questions.filter((q) => {
    if (filter?.caseId && q.case_id !== filter.caseId) return false;
    if (filter?.status && q.status !== filter.status) return false;
    return true;
  });
}

export async function serveQuestion(args: {
  personId: string;
  sessionKey: string;
  preferredCaseIds?: string[];
}) {
  if (!isSampleDataMode()) return sb.serveQuestion(args);
  const store = await readStore();
  const seen = new Set(store.drill_session_seen[args.sessionKey] ?? []);
  const scoresByQuestion = new Map<string, number[]>();
  for (const a of store.answers.filter((x) => x.person_id === args.personId)) {
    if (a.score == null) continue;
    const arr = scoresByQuestion.get(a.question_id) ?? [];
    arr.push(a.score);
    scoresByQuestion.set(a.question_id, arr);
  }

  const roles = store.case_roles.filter((r) => r.person_id === args.personId);
  const preferred =
    args.preferredCaseIds ??
    (roles.length ? roles.map((r) => r.case_id) : store.cases.filter((c) => c.active).map((c) => c.id));

  const picked = pickWeightedQuestion({
    pool: store.questions.filter((q) => q.status === "active"),
    seenInSession: seen,
    caseIdsPreferred: preferred,
    scoresByQuestion,
  });

  if (!picked) return null;

  await updateStore((s) => {
    const list = s.drill_session_seen[args.sessionKey] ?? [];
    list.push(picked.id);
    s.drill_session_seen[args.sessionKey] = list;
  });

  return picked;
}

export async function answerQuestion(args: {
  questionId: string;
  personId: string;
  text: string;
  mode?: "typed" | "spoken";
  score?: number | null;
  feedback?: string | null;
}) {
  if (!isSampleDataMode()) return sb.answerQuestion(args);
  const store = await readStore();
  const person = store.people.find((p) => p.id === args.personId);
  const prior = store.answers.filter(
    (a) => a.question_id === args.questionId && a.person_id === args.personId,
  );
  const firstScore = prior[0]?.score;
  // Self-relative: score against first attempt if not provided
  let score = args.score;
  if (score == null) {
    score = Math.min(1, 0.4 + args.text.trim().split(/\s+/).length / 40);
  }

  let row!: QuestionAnswer;
  await updateStore((s) => {
    row = {
      id: randomUUID(),
      question_id: args.questionId,
      person_id: args.personId,
      team_id: person?.team_id ?? null,
      text: args.text,
      mode: args.mode ?? "typed",
      transcript_ref: null,
      score,
      feedback:
        args.feedback ??
        (firstScore != null && score! > firstScore
          ? "Better than your first attempt on this question."
          : "Logged. Compare later attempts to your own first try."),
      created_at: nowIso(),
      created_by: args.personId,
    };
    s.answers.push(row);
  });

  await recomputeRoadmapStages(args.personId);

  const q = store.questions.find((x) => x.id === args.questionId);
  if (q?.case_id && row.score != null) {
    const { observeClaimAttempt } = await import(
      "@/lib/cruxy/socratic-outcomes"
    );
    await observeClaimAttempt({
      personId: args.personId,
      caseId: q.case_id,
      attemptKind: "drill",
      scoreAfter: row.score,
      refId: row.id,
    }).catch(() => undefined);
  }

  return row;
}

export async function bestTeamAnswer(questionId: string, teamId: string) {
  if (!isSampleDataMode()) return sb.bestTeamAnswer(questionId, teamId);
  const store = await readStore();
  return (
    store.answers
      .filter((a) => a.question_id === questionId && a.team_id === teamId)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null
  );
}

// ---------- Socratic + language + warm-up ----------

export async function startSocraticDrill(args: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<SocraticSession> {
  if (!isSampleDataMode()) return sb.startSocraticDrill(args);
  const store = await readStore();
  const claims = store.claims.filter(
    (c) => c.team_id === args.teamId && c.case_id === args.caseId,
  );
  const { question, claimLinks } = await cruxySocraticOpening({
    claims,
    personId: args.personId,
  });

  let session!: SocraticSession;
  await updateStore((s) => {
    session = {
      id: randomUUID(),
      person_id: args.personId,
      team_id: args.teamId,
      case_id: args.caseId,
      turns: [
        { role: "cruxy", text: question, at: nowIso() },
      ],
      summary: null,
      claim_links: claimLinks,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    s.socratic_sessions.push(session);
  });
  return session;
}

export async function continueSocratic(args: {
  sessionId: string;
  personId: string;
  answer: string;
}): Promise<SocraticSession> {
  if (!isSampleDataMode()) return sb.continueSocratic(args);
  const store = await readStore();
  const cur = store.socratic_sessions.find((x) => x.id === args.sessionId);
  if (!cur) throw new Error("session not found");
  // Personal Socratic transcript: only the owner may continue.
  if (cur.person_id !== args.personId) {
    throw new Error("That Socratic session belongs to someone else.");
  }
  const turns = [
    ...cur.turns,
    { role: "person" as const, text: args.answer, at: nowIso() },
  ];
  const claims = store.claims.filter(
    (c) => c.team_id === cur.team_id && c.case_id === cur.case_id,
  );
  const next = await cruxySocraticAfterAnswer({
    claims,
    turns,
    personId: args.personId,
  });

  let session!: SocraticSession;
  await updateStore((s) => {
    const live = s.socratic_sessions.find((x) => x.id === args.sessionId);
    if (!live) throw new Error("session not found");
    live.turns = turns;
    if (next.status === "done") {
      live.summary = next.summary;
      live.status = "done";
    } else {
      live.turns.push({
        role: "cruxy",
        text: next.question,
        at: nowIso(),
      });
    }
    live.updated_at = nowIso();
    session = live;
  });
  if (session.status === "done") {
    const { openSocraticOutcomes } = await import(
      "@/lib/cruxy/socratic-outcomes"
    );
    await openSocraticOutcomes(session).catch(() => undefined);
  }
  return session;
}

export async function languageSuggestions(args: {
  personId: string;
  teamId: string;
  caseId: string;
  claimId?: string;
}) {
  if (!isSampleDataMode()) return sb.languageSuggestions(args);
  const store = await readStore();
  const claim =
    store.claims.find((c) => c.id === args.claimId) ??
    store.claims.find(
      (c) => c.team_id === args.teamId && c.case_id === args.caseId,
    );
  const truth = store.truth_items.filter(
    (t) => t.team_id === args.teamId && t.case_id === args.caseId,
  );
  return cruxyLanguageSuggestions({
    claim,
    truthItems: truth,
    personId: args.personId,
  });
}

export async function savePhrase(args: {
  personId: string;
  caseId: string | null;
  claimRef: string | null;
  text: string;
  kind: PhrasebookEntry["kind"];
}) {
  if (!isSampleDataMode()) return sb.savePhrase(args);
  let row!: PhrasebookEntry;
  await updateStore((s) => {
    row = {
      id: randomUUID(),
      person_id: args.personId,
      case_id: args.caseId,
      claim_ref: args.claimRef,
      text: args.text,
      kind: args.kind,
      created_at: nowIso(),
    };
    s.phrasebook_entries.push(row);
  });
  return row;
}

export async function listPhrasebook(personId: string) {
  if (!isSampleDataMode()) return sb.listPhrasebook(personId);
  const store = await readStore();
  return store.phrasebook_entries.filter((p) => p.person_id === personId);
}

export async function buildWarmUp(personId: string) {
  if (!isSampleDataMode()) return sb.buildWarmUp(personId);
  await autoAssignLeadDecks(personId);
  const due = await dueFlashcardsForPerson(personId);
  const cards = due.slice(0, 5).map((d) => d.card);
  const sessionKey = `warmup-${personId}-${Date.now()}`;
  const q1 = await serveQuestion({ personId, sessionKey });
  const q2 = await serveQuestion({ personId, sessionKey });
  return {
    flashcards: cards,
    moderator_questions: [q1, q2].filter(Boolean),
    counterclaim_prompt:
      "Out loud: concede, distinguish, then rebut your case's main counterclaim in under 90 seconds.",
    minutes: 10,
  };
}

// ---------- Roadmap ----------

export async function ensureRoadmapForPerson(personId: string) {
  if (!isSampleDataMode()) return sb.ensureRoadmapForPerson(personId);
  await updateStore((s) => {
    const person = s.people.find((p) => p.id === personId);
    if (!person) return;
    const activeCases = s.cases.filter((c) => c.active);
    const existing = new Set(
      s.roadmap_stages
        .filter((r) => r.person_id === personId)
        .map((r) => `${r.case_id}:${r.stage}`),
    );
    const rolesByCase = new Map<string, CaseRoleRow["role"][]>();
    for (const role of s.case_roles.filter((r) => r.person_id === personId)) {
      const arr = rolesByCase.get(role.case_id) ?? [];
      arr.push(role.role);
      rolesByCase.set(role.case_id, arr);
    }
    const optIn = new Set(
      s.deck_opt_ins
        .filter((d) => d.person_id === personId)
        .map((d) => d.case_id),
    );
    const competition = s.competitions[0]?.date ?? "2026-12-05";
    const built = buildRoadmapForPerson({
      personId,
      caseIds: activeCases.map((c) => c.id),
      rolesByCase,
      flashcardOptInCases: optIn,
      competitionDate: competition,
    });
    for (const row of built) {
      const key = `${row.case_id}:${row.stage}`;
      if (!existing.has(key)) s.roadmap_stages.push(row);
      else {
        // refresh required/due
        const cur = s.roadmap_stages.find(
          (r) =>
            r.person_id === personId &&
            r.case_id === row.case_id &&
            r.stage === row.stage,
        );
        if (cur) {
          cur.required = row.required;
          cur.due = row.due;
        }
      }
    }
  });
}

export async function recomputeRoadmapStages(personId: string) {
  if (!isSampleDataMode()) return sb.recomputeRoadmapStages(personId);
  await ensureRoadmapForPerson(personId);
  await updateStore((s) => {
    const stages = s.roadmap_stages.filter((r) => r.person_id === personId);
    for (const stage of stages) {
      if (stage.done_at) continue;
      if (
        isStageDone(
          s,
          personId,
          stage.case_id,
          stage.stage as RoadmapStageId,
        )
      ) {
        stage.done_at = nowIso();
      }
    }
  });
}

function isStageDone(
  s: Awaited<ReturnType<typeof readStore>>,
  personId: string,
  caseId: string,
  stage: RoadmapStageId,
): boolean {
  switch (stage) {
    case "read": {
      const progress = s.reading_progress.filter(
        (r) => r.person_id === personId && r.case_id === caseId,
      );
      if (progress.length === 0) return false;
      return progress.every((p) => p.opened_ratio >= 0.6);
    }
    case "map": {
      const person = s.people.find((p) => p.id === personId);
      const teamId = person?.team_id;
      const claims = s.claims.filter(
        (c) => c.case_id === caseId && (!teamId || c.team_id === teamId),
      );
      if (claims.length === 0) return false;
      const reviews = s.map_reviews.filter(
        (m) => m.person_id === personId && m.case_id === caseId,
      );
      return claims.every(
        (c) =>
          reviews.some((r) => r.claim_id === c.id) ||
          reviews.some((r) => r.kind === "reviewed_all"),
      );
    }
    case "one_pager": {
      const person = s.people.find((p) => p.id === personId);
      const teamId = person?.team_id;
      const page = s.one_pagers
        .filter(
          (o) =>
            o.case_id === caseId && (!teamId || o.team_id === teamId),
        )
        .sort((a, b) => b.version - a.version)[0];
      if (!page) return false;
      if (page.body.empty_rows.length > 0) return false;
      return page.signed_off_by.includes(personId);
    }
    case "flashcards": {
      const person = s.people.find((p) => p.id === personId);
      const teamId = person?.team_id;
      const cards = s.flashcards.filter(
        (c) => c.case_id === caseId && (!teamId || c.team_id === teamId),
      );
      const reviews = s.card_reviews.filter((r) => r.person_id === personId);
      return flashcardStageComplete(reviews, cards.map((c) => c.id));
    }
    case "question_drill": {
      const qIds = new Set(
        s.questions
          .filter((q) => q.case_id === caseId && q.status === "active")
          .map((q) => q.id),
      );
      const answers = s.answers.filter(
        (a) => a.person_id === personId && qIds.has(a.question_id),
      );
      if (answers.length < 10) return false;
      // average above own first attempts
      const byQ = new Map<string, number[]>();
      for (const a of answers) {
        const arr = byQ.get(a.question_id) ?? [];
        arr.push(a.score ?? 0);
        byQ.set(a.question_id, arr);
      }
      let improved = 0;
      let compared = 0;
      for (const scores of byQ.values()) {
        if (scores.length < 2) continue;
        compared += 1;
        const first = scores[0];
        const avg =
          scores.slice(1).reduce((x, y) => x + y, 0) / (scores.length - 1);
        if (avg > first) improved += 1;
      }
      return compared > 0 && improved / compared >= 0.5;
    }
    case "practiced":
      return s.practice_speak_logs.some(
        (p) =>
          p.person_id === personId && p.case_id === caseId && p.spoken,
      );
    case "judged": {
      const attempts = s.judge_attempts
        .filter((j) => j.person_id === personId && j.case_id === caseId)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      if (attempts.length < 2) return false;
      const first = attempts[0].score;
      const latest = attempts[attempts.length - 1].score;
      return latest > first;
    }
    default:
      return false;
  }
}

export async function recordReadingProgress(args: {
  personId: string;
  caseId: string;
  fileId: string;
  openedRatio: number;
}) {
  if (!isSampleDataMode()) return sb.recordReadingProgress(args);
  await updateStore((s) => {
    const i = s.reading_progress.findIndex(
      (r) =>
        r.person_id === args.personId &&
        r.case_id === args.caseId &&
        r.file_id === args.fileId,
    );
    const row = {
      id: i >= 0 ? s.reading_progress[i].id : randomUUID(),
      person_id: args.personId,
      case_id: args.caseId,
      file_id: args.fileId,
      opened_ratio: args.openedRatio,
      created_at: i >= 0 ? s.reading_progress[i].created_at : nowIso(),
      updated_at: nowIso(),
    };
    if (i >= 0) s.reading_progress[i] = row;
    else s.reading_progress.push(row);
  });
  await recomputeRoadmapStages(args.personId);
}

export async function recordMapReview(args: {
  personId: string;
  teamId: string;
  caseId: string;
  claimId?: string | null;
  kind?: string;
}) {
  if (!isSampleDataMode()) return sb.recordMapReview(args);
  await updateStore((s) => {
    s.map_reviews.push({
      id: randomUUID(),
      person_id: args.personId,
      team_id: args.teamId,
      case_id: args.caseId,
      claim_id: args.claimId ?? null,
      kind: args.kind ?? "reviewed",
      created_at: nowIso(),
    });
  });
  await recomputeRoadmapStages(args.personId);
}

export async function recordPracticeSpeak(args: {
  personId: string;
  caseId: string;
}) {
  if (!isSampleDataMode()) return sb.recordPracticeSpeak(args);
  await updateStore((s) => {
    s.practice_speak_logs.push({
      id: randomUUID(),
      person_id: args.personId,
      case_id: args.caseId,
      round_id: null,
      spoken: true,
      created_at: nowIso(),
    });
  });
  await recomputeRoadmapStages(args.personId);
}

export async function recordJudgeAttempt(args: {
  personId: string;
  caseId: string;
  score: number;
}) {
  if (!isSampleDataMode()) return sb.recordJudgeAttempt(args);
  await updateStore((s) => {
    s.judge_attempts.push({
      id: randomUUID(),
      person_id: args.personId,
      case_id: args.caseId,
      score: args.score,
      created_at: nowIso(),
    });
  });
  await recomputeRoadmapStages(args.personId);
}

export async function getRoadmapView(personId: string) {
  if (!isSampleDataMode()) return sb.getRoadmapView(personId);
  await ensureRoadmapForPerson(personId);
  await recomputeRoadmapStages(personId);
  const store = await readStore();
  const stages = store.roadmap_stages.filter((r) => r.person_id === personId);
  const caseTitles = new Map(
    store.cases.map((c) => [
      c.id,
      `${String(c.number).padStart(2, "0")} ${c.title}`,
    ]),
  );
  const typedStages = stages as RoadmapStage[];
  const byCase = new Map<string, RoadmapStage[]>();
  for (const s of typedStages) {
    const arr = byCase.get(s.case_id) ?? [];
    arr.push(s);
    byCase.set(s.case_id, arr);
  }
  const cases = store.cases
    .filter((c) => c.active)
    .map((c) => ({
      case: c,
      stages: byCase.get(c.id) ?? [],
      readiness: readinessForCase(byCase.get(c.id) ?? []),
    }));

  return {
    cases,
    doNext: doNextActions(typedStages, caseTitles, 3),
    competitionDate: store.competitions[0]?.date ?? "2026-12-05",
  };
}

export async function studyingLabels(personId: string) {
  if (!isSampleDataMode()) return sb.studyingLabels(personId);
  const store = await readStore();
  const assigned = new Set(
    store.case_roles
      .filter(
        (r) =>
          r.person_id === personId &&
          (r.role === "lead_1" || r.role === "lead_2"),
      )
      .map((r) => r.case_id),
  );
  return store.deck_opt_ins
    .filter((d) => d.person_id === personId && !d.assigned && !assigned.has(d.case_id))
    .map((d) => {
      const c = store.cases.find((x) => x.id === d.case_id);
      return c
        ? `studying Case ${c.number} (not assigned)`
        : "studying a case (not assigned)";
    });
}

export async function listCasesAndTeams() {
  if (!isSampleDataMode()) return sb.listCasesAndTeams();
  const store = await readStore();
  return {
    cases: store.cases.filter((c) => c.active),
    teams: store.teams,
    people: store.people,
    case_roles: store.case_roles,
  };
}

export async function deletePhrasebookEntry(personId: string, entryId: string) {
  if (!isSampleDataMode()) return sb.deletePhrasebookEntry(personId, entryId);
  await updateStore((s) => {
    s.phrasebook_entries = s.phrasebook_entries.filter(
      (e) => !(e.id === entryId && e.person_id === personId),
    );
  });
}

export async function listAnswersForQuestion(
  questionId: string,
  teamId?: string,
) {
  if (!isSampleDataMode()) return sb.listAnswersForQuestion(questionId, teamId);
  const store = await readStore();
  return listAnswersForQuestionSample(store.answers, questionId, teamId);
}

export async function robustnessMeterForCase(caseId: string, teamId: string) {
  if (!isSampleDataMode()) return sb.robustnessMeterForCase(caseId, teamId);
  const store = await readStore();
  return computeRobustnessFromStore({
    questions: store.questions,
    answers: store.answers,
    members: store.people,
    caseId,
    teamId,
  });
}

export async function generateCruxyModeratorQuestions(args: {
  personId: string;
  teamId: string;
  caseId: string;
}) {
  if (!isSampleDataMode()) return sb.generateCruxyModeratorQuestions(args);
  const store = await readStore();
  const caseRow = store.cases.find((c) => c.id === args.caseId);
  if (!caseRow) throw new Error("case not found");
  const summaries = store.claims
    .filter((c) => c.team_id === args.teamId && c.case_id === args.caseId)
    .map((c) => c.text);
  if (!summaries.length) summaries.push("Team claim map not filled yet.");

  const { runModerator } = await import("@/lib/cruxy/agents/moderator");
  const mod = await runModerator({
    caseNumber: caseRow.number,
    caseTitle: caseRow.title,
    claimSummaries: summaries,
    personId: args.personId,
  });

  const created: ModeratorQuestion[] = [];
  await updateStore((s) => {
    for (const q of mod.questions) {
      const row: ModeratorQuestion = {
        id: randomUUID(),
        case_id: args.caseId,
        text: q.text,
        type: q.type,
        difficulty: Math.min(3, Math.max(1, q.difficulty)) as 1 | 2 | 3,
        origin: "cruxy",
        origin_label: "Cruxy",
        status: "pending_confirm",
        asked_at_tag: q.type === "closing" ? "closing" : null,
        created_at: nowIso(),
        created_by: args.personId,
      };
      s.questions.push(row);
      created.push(row);
    }
  });

  await logActivity({
    person_id: args.personId,
    action: "moderator_cruxy_generate",
    target: args.caseId,
    meta: { count: created.length, team_id: args.teamId },
  });

  return created;
}

export async function listTeamCaseClaims(teamId: string, caseId: string) {
  if (!isSampleDataMode()) return sb.listTeamCaseClaims(teamId, caseId);
  const store = await readStore();
  return store.claims.filter(
    (c) => c.team_id === teamId && c.case_id === caseId,
  );
}
