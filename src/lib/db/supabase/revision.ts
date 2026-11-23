import "server-only";
import { randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { iso, isoOrNull, type Row } from "@/lib/db/supabase/util";
import { logActivity } from "@/lib/db/repository";
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

export {
  deletePhrasebookEntry,
  generateCruxyModeratorQuestions,
  listAnswersForQuestion,
  robustnessMeterForCase,
} from "@/lib/db/supabase/revision-wave5";
import { diffOnePagerBodies, draftOnePagerBody } from "@/lib/revision/one-pager";
import {
  buildRoadmapForPerson,
  doNextActions,
  readinessForCase,
} from "@/lib/revision/roadmap";
import type {
  CardFsrsState,
  CaseRoleRow,
  ClaimRow,
  CounterclaimRow,
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
  SupportRow,
  TruthItem,
} from "@/lib/revision/types";
import type { CaseRow, Person, Team } from "@/lib/types";
import { nowIso } from "@/lib/utils";

/** Drop stale drill "seen" rows older than this (per person). */
const DRILL_SEEN_WINDOW_MS = 48 * 60 * 60 * 1000;

function must<T>(
  res: { data: T; error: { message: string } | null },
  ctx: string,
): T {
  assertOk(res.error, ctx);
  return res.data;
}

// ---------- row mappers ----------

function mapTruth(r: Row): TruthItem {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    kind: r.kind,
    text: r.text,
    citation_ids: r.citation_ids ?? [],
    status: r.status,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: iso(r.updated_at ?? r.created_at),
  };
}

function mapFlashcard(r: Row): Flashcard {
  return {
    id: r.id,
    team_id: r.team_id ?? null,
    case_id: r.case_id ?? null,
    deck: r.deck ?? "",
    front: r.front,
    back: r.back,
    citation_ids: r.citation_ids ?? [],
    truth_item_id: r.truth_item_id ?? null,
    claim_id: r.claim_id ?? null,
    source_kind: r.source_kind ?? "manual",
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: iso(r.updated_at ?? r.created_at),
  };
}

function flashcardToRow(c: Flashcard): Row {
  return {
    id: c.id,
    team_id: c.team_id,
    case_id: c.case_id,
    deck: c.deck,
    front: c.front,
    back: c.back,
    citation_ids: c.citation_ids,
    truth_item_id: c.truth_item_id,
    claim_id: c.claim_id,
    source_kind: c.source_kind,
    created_at: c.created_at,
    created_by: c.created_by,
    updated_at: c.updated_at,
  };
}

function mapClaim(r: Row): ClaimRow {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    text: r.text,
    logic_line: r.logic_line ?? null,
    ord: r.ord ?? 0,
    citation_ids: r.citation_ids ?? [],
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: iso(r.updated_at ?? r.created_at),
  };
}

function mapSupport(r: Row): SupportRow {
  return {
    id: r.id,
    claim_id: r.claim_id,
    team_id: r.team_id,
    case_id: r.case_id,
    text: r.text,
    logic_line: r.logic_line ?? null,
    ord: r.ord ?? 0,
    citation_ids: r.citation_ids ?? [],
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: iso(r.updated_at ?? r.created_at),
  };
}

function mapCounterclaim(r: Row): CounterclaimRow {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    claim_id: r.claim_id ?? null,
    text: r.text,
    concede: r.concede ?? null,
    distinguish: r.distinguish ?? null,
    rebut: r.rebut ?? null,
    citation_ids: r.citation_ids ?? [],
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: iso(r.updated_at ?? r.created_at),
  };
}

function mapOnePager(r: Row): OnePager {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    version: r.version,
    body: r.body,
    previous_body: r.previous_body ?? null,
    change_note: r.change_note ?? null,
    signed_off_by: r.signed_off_by ?? [],
    drive_doc_id: r.drive_doc_id ?? null,
    drive_pdf_exported: Boolean(r.drive_pdf_exported),
    origin_tag: r.origin_tag ?? "Cruxy",
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapFsrs(r: Row): CardFsrsState {
  return {
    id: r.id,
    person_id: r.person_id,
    card_id: r.card_id,
    due: iso(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: isoOrNull(r.last_review),
    correct_streak: r.correct_streak ?? 0,
    pinned: Boolean(r.pinned),
    created_at: iso(r.created_at),
  };
}

function mapQuestion(r: Row): ModeratorQuestion {
  return {
    id: r.id,
    case_id: r.case_id,
    text: r.text,
    type: r.type,
    difficulty: r.difficulty ?? 1,
    origin: r.origin,
    origin_label: r.origin_label ?? "",
    status: r.status ?? "active",
    asked_at_tag: r.asked_at_tag ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapAnswer(r: Row): QuestionAnswer {
  return {
    id: r.id,
    question_id: r.question_id,
    person_id: r.person_id,
    team_id: r.team_id ?? null,
    text: r.text ?? "",
    mode: r.mode ?? "typed",
    transcript_ref: r.transcript_ref ?? null,
    score: r.score ?? null,
    feedback: r.feedback ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapSocratic(r: Row): SocraticSession {
  return {
    id: r.id,
    person_id: r.person_id,
    team_id: r.team_id,
    case_id: r.case_id,
    turns: r.turns ?? [],
    summary: r.summary ?? null,
    claim_links: r.claim_links ?? [],
    status: r.status,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function mapPhrase(r: Row): PhrasebookEntry {
  return {
    id: r.id,
    person_id: r.person_id,
    case_id: r.case_id ?? null,
    claim_ref: r.claim_ref ?? null,
    text: r.text,
    kind: r.kind,
    created_at: iso(r.created_at),
  };
}

function mapStage(r: Row): RoadmapStage {
  return {
    id: r.id,
    person_id: r.person_id,
    case_id: r.case_id,
    stage: r.stage,
    required: Boolean(r.required),
    due: r.due ?? null,
    done_at: isoOrNull(r.done_at),
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapCase(r: Row): CaseRow {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    case_set_page: r.case_set_page ?? null,
    crux: r.crux ?? null,
    trap: r.trap ?? null,
    closing_question: r.closing_question ?? null,
    active: Boolean(r.active),
    created_at: iso(r.created_at),
  };
}

// ---------- Truth items + flashcard sync ----------

export async function listTruthItems(filter?: {
  teamId?: string;
  caseId?: string;
}): Promise<TruthItem[]> {
  const sb = getServiceSupabase();
  let q = sb.from("truth_items").select("*");
  if (filter?.teamId) q = q.eq("team_id", filter.teamId);
  if (filter?.caseId) q = q.eq("case_id", filter.caseId);
  const rows =
    must(await q.order("created_at", { ascending: true }), "listTruthItems") ?? [];
  return rows.map(mapTruth);
}

async function loadTeamCaseCards(teamId: string, caseId: string) {
  const sb = getServiceSupabase();
  const [truthRows, cardRows] = await Promise.all([
    sb
      .from("truth_items")
      .select("*")
      .eq("team_id", teamId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    sb
      .from("flashcards")
      .select("*")
      .eq("team_id", teamId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
  ]);
  return {
    truth: (must(truthRows, "loadTeamCaseCards.truth") ?? []).map(mapTruth),
    cards: (must(cardRows, "loadTeamCaseCards.cards") ?? []).map(mapFlashcard),
  };
}

/** Mirrors the sample "replace team/case cards with the synced set" step. */
async function persistSyncedCards(existing: Flashcard[], synced: Flashcard[]) {
  const sb = getServiceSupabase();
  const keep = new Set(synced.map((c) => c.id));
  const dropped = existing.filter((c) => !keep.has(c.id)).map((c) => c.id);
  if (dropped.length > 0) {
    // card_reviews has no cascade; card_fsrs_states cascades with the card.
    assertOk(
      (await sb.from("card_reviews").delete().in("card_id", dropped)).error,
      "persistSyncedCards.reviews",
    );
    assertOk(
      (await sb.from("flashcards").delete().in("id", dropped)).error,
      "persistSyncedCards.delete",
    );
  }
  const rows = synced.filter((c) => c.truth_item_id).map(flashcardToRow);
  if (rows.length > 0) {
    assertOk(
      (await sb.from("flashcards").upsert(rows, { onConflict: "id" })).error,
      "persistSyncedCards.upsert",
    );
  }
}

export async function updateTruthItemText(
  truthItemId: string,
  text: string,
  personId: string | null,
): Promise<{ item: TruthItem; flashcard: Flashcard | null }> {
  const sb = getServiceSupabase();
  const row = must(
    await sb
      .from("truth_items")
      .update({ text, updated_at: nowIso() })
      .eq("id", truthItemId)
      .select("*")
      .maybeSingle(),
    "updateTruthItemText",
  );
  if (!row) throw new Error("truth item not found");
  const item = mapTruth(row);

  const { truth, cards } = await loadTeamCaseCards(item.team_id, item.case_id);
  const synced = syncFlashcardsFromTruth(truth, cards);
  await persistSyncedCards(cards, synced.cards);
  const flashcard =
    synced.cards.find((c) => c.truth_item_id === truthItemId) ?? null;

  await logActivity({
    person_id: personId,
    action: "truth_item_updated",
    target: truthItemId,
    meta: { flashcard_id: flashcard?.id ?? null },
  });

  return { item, flashcard };
}

export async function ensureFlashcardsForTeamCase(
  teamId: string,
  caseId: string,
): Promise<Flashcard[]> {
  const { truth, cards } = await loadTeamCaseCards(teamId, caseId);
  const synced = syncFlashcardsFromTruth(truth, cards);
  await persistSyncedCards(cards, synced.cards);
  return synced.cards;
}

export async function listFlashcards(filter?: {
  teamId?: string;
  caseId?: string;
  personId?: string;
}): Promise<Flashcard[]> {
  const sb = getServiceSupabase();
  let q = sb.from("flashcards").select("*");
  if (filter?.teamId) q = q.eq("team_id", filter.teamId);
  if (filter?.caseId) q = q.eq("case_id", filter.caseId);
  const rows =
    must(await q.order("created_at", { ascending: true }), "listFlashcards") ?? [];
  return rows.map(mapFlashcard);
}

export async function optInDeck(args: {
  personId: string;
  teamId: string;
  caseId: string;
  assigned?: boolean;
}): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("deck_opt_ins").upsert(
        {
          person_id: args.personId,
          team_id: args.teamId,
          case_id: args.caseId,
          assigned: args.assigned ?? false,
        },
        { onConflict: "person_id,case_id" },
      )
    ).error,
    "optInDeck",
  );
  await ensureRoadmapForPerson(args.personId);
  await recomputeRoadmapStages(args.personId);
}

export async function autoAssignLeadDecks(personId: string): Promise<void> {
  const sb = getServiceSupabase();
  const person = must(
    await sb.from("people").select("id,team_id").eq("id", personId).maybeSingle(),
    "autoAssignLeadDecks.person",
  );
  if (!person?.team_id) return;
  const leadRoles =
    must(
      await sb
        .from("case_roles")
        .select("team_id,case_id,role")
        .eq("person_id", personId)
        .in("role", ["lead_1", "lead_2"]),
      "autoAssignLeadDecks.roles",
    ) ?? [];
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
  const sb = getServiceSupabase();
  const find = async () =>
    must(
      await sb
        .from("card_fsrs_states")
        .select("*")
        .eq("person_id", personId)
        .eq("card_id", cardId)
        .maybeSingle(),
      "getOrCreateFsrsState.find",
    );
  const existing = await find();
  if (existing) return mapFsrs(existing);

  const empty = createEmptyCard();
  assertOk(
    (
      await sb.from("card_fsrs_states").upsert(
        {
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
        },
        { onConflict: "person_id,card_id", ignoreDuplicates: true },
      )
    ).error,
    "getOrCreateFsrsState.insert",
  );
  const created = await find();
  if (!created) throw new Error("getOrCreateFsrsState: row missing after insert");
  return mapFsrs(created);
}

export async function reviewFlashcard(args: {
  personId: string;
  cardId: string;
  grade: FsrsRating;
  mode?: "typed" | "spoken";
}): Promise<{ state: CardFsrsState; mastery: NodeMastery | null }> {
  const sb = getServiceSupabase();
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

  const streak = args.grade >= 3 ? (prior.correct_streak || 0) + 1 : 0;
  const dueIso = next.due.toISOString();
  assertOk(
    (
      await sb
        .from("card_fsrs_states")
        .update({
          due: dueIso,
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
        })
        .eq("id", prior.id)
    ).error,
    "reviewFlashcard.state",
  );
  assertOk(
    (
      await sb.from("card_reviews").insert({
        id: randomUUID(),
        person_id: args.personId,
        card_id: args.cardId,
        grade: args.grade,
        next_due: dueIso,
        mode: args.mode ?? "typed",
        created_at: nowIso(),
        created_by: args.personId,
      })
    ).error,
    "reviewFlashcard.review",
  );

  const { updateNodeMasteryAfterReview } = await import(
    "@/lib/db/supabase/graph-flashcards"
  );
  const mastery = await updateNodeMasteryAfterReview({
    personId: args.personId,
    cardId: args.cardId,
    grade: args.grade,
  });

  await recomputeRoadmapStages(args.personId);

  const cardRow = must(
    await sb
      .from("flashcards")
      .select("case_id")
      .eq("id", args.cardId)
      .maybeSingle(),
    "reviewFlashcard.card",
  );
  if (cardRow?.case_id) {
    const { observeClaimAttempt } = await import(
      "@/lib/cruxy/socratic-outcomes"
    );
    await observeClaimAttempt({
      personId: args.personId,
      caseId: cardRow.case_id as string,
      attemptKind: "flashcard",
      scoreAfter: args.grade,
      refId: args.cardId,
    }).catch(() => undefined);
  }

  await logActivity({
    person_id: args.personId,
    action: "flashcard_review",
    target: args.cardId,
    meta: { grade: args.grade, mode: args.mode ?? "typed" },
  });

  const state = await getOrCreateFsrsState(args.personId, args.cardId);
  return { state, mastery };
}

export async function dueFlashcardsForPerson(
  personId: string,
): Promise<{ card: Flashcard; state: CardFsrsState | null }[]> {
  const sb = getServiceSupabase();
  const [optIns, roles] = await Promise.all([
    sb.from("deck_opt_ins").select("case_id").eq("person_id", personId),
    sb
      .from("case_roles")
      .select("case_id")
      .eq("person_id", personId)
      .in("role", ["lead_1", "lead_2"]),
  ]);
  const caseIds = new Set<string>();
  for (const r of must(optIns, "dueFlashcards.optIns") ?? []) caseIds.add(r.case_id);
  for (const r of must(roles, "dueFlashcards.roles") ?? []) caseIds.add(r.case_id);
  if (caseIds.size === 0) return [];

  const cardRows =
    must(
      await sb
        .from("flashcards")
        .select("*")
        .in("case_id", [...caseIds])
        .order("created_at", { ascending: true }),
      "dueFlashcards.cards",
    ) ?? [];
  const cards = cardRows.map(mapFlashcard);
  if (cards.length === 0) return [];

  const stateRows =
    must(
      await sb
        .from("card_fsrs_states")
        .select("*")
        .eq("person_id", personId)
        .in(
          "card_id",
          cards.map((c: Flashcard) => c.id),
        ),
      "dueFlashcards.states",
    ) ?? [];
  const stateByCard = new Map<string, CardFsrsState>(
    stateRows.map((r: Row) => [r.card_id, mapFsrs(r)]),
  );

  const now = Date.now();
  const due: { card: Flashcard; state: CardFsrsState | null }[] = [];
  for (const card of cards) {
    const state = stateByCard.get(card.id) ?? null;
    if (!state || new Date(state.due).getTime() <= now) {
      due.push({ card, state });
    }
  }
  return due;
}

// ---------- One pagers ----------

async function insertOnePagerVersion(
  build: (version: number, prev: OnePager | null) => Omit<OnePager, "version">,
  teamId: string,
  caseId: string,
): Promise<OnePager> {
  const sb = getServiceSupabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = must(
      await sb
        .from("one_pagers")
        .select("*")
        .eq("team_id", teamId)
        .eq("case_id", caseId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "insertOnePagerVersion.latest",
    );
    const prev = latest ? mapOnePager(latest) : null;
    const version = prev ? prev.version + 1 : 1;
    const page: OnePager = { ...build(version, prev), version };
    const res = await sb.from("one_pagers").insert({
      id: page.id,
      team_id: page.team_id,
      case_id: page.case_id,
      version: page.version,
      body: page.body,
      previous_body: page.previous_body,
      change_note: page.change_note,
      signed_off_by: page.signed_off_by,
      drive_doc_id: page.drive_doc_id,
      drive_pdf_exported: page.drive_pdf_exported,
      origin_tag: page.origin_tag,
      created_at: page.created_at,
      created_by: page.created_by,
    });
    // 23505: another request took this version number first; retry with the new latest.
    if (res.error && (res.error as { code?: string }).code === "23505") continue;
    assertOk(res.error, "insertOnePagerVersion");
    return page;
  }
  throw new Error("insertOnePagerVersion: version conflict, try again");
}

export async function draftOnePager(args: {
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<OnePager> {
  const sb = getServiceSupabase();
  const [caseRes, claims, supports, counterclaims, truth] = await Promise.all([
    sb.from("cases").select("*").eq("id", args.caseId).maybeSingle(),
    sb.from("claims").select("*").eq("team_id", args.teamId).eq("case_id", args.caseId),
    sb.from("supports").select("*").eq("team_id", args.teamId).eq("case_id", args.caseId),
    sb
      .from("counterclaims")
      .select("*")
      .eq("team_id", args.teamId)
      .eq("case_id", args.caseId),
    sb
      .from("truth_items")
      .select("*")
      .eq("team_id", args.teamId)
      .eq("case_id", args.caseId),
  ]);
  const caseRow = must(caseRes, "draftOnePager.case");
  const body = draftOnePagerBody({
    claims: (must(claims, "draftOnePager.claims") ?? []).map(mapClaim),
    supports: (must(supports, "draftOnePager.supports") ?? []).map(mapSupport),
    counterclaims: (must(counterclaims, "draftOnePager.counterclaims") ?? []).map(
      mapCounterclaim,
    ),
    truthItems: (must(truth, "draftOnePager.truth") ?? []).map(mapTruth),
    caseTitle: caseRow?.title ?? "Case",
  });

  await callCruxy({
    feature: "one_pager_draft",
    model: "small",
    messages: [
      {
        role: "user",
        content: `Draft one pager for case ${caseRow?.number ?? ""}`,
      },
    ],
    personId: args.personId,
  });

  const created = await insertOnePagerVersion(
    (_version, prev) => ({
      id: randomUUID(),
      team_id: args.teamId,
      case_id: args.caseId,
      body,
      previous_body: prev?.body ?? null,
      change_note: prev ? "Cruxy re-draft on request" : "Initial Cruxy draft",
      signed_off_by: [],
      drive_doc_id: null,
      drive_pdf_exported: false,
      origin_tag: "Cruxy",
      created_at: nowIso(),
      created_by: args.personId,
    }),
    args.teamId,
    args.caseId,
  );

  await logActivity({
    person_id: args.personId,
    action: "one_pager_drafted",
    target: created.id,
  });
  return created;
}

async function getOnePagerRow(onePagerId: string): Promise<OnePager> {
  const sb = getServiceSupabase();
  const row = must(
    await sb.from("one_pagers").select("*").eq("id", onePagerId).maybeSingle(),
    "getOnePager",
  );
  if (!row) throw new Error("one pager not found");
  return mapOnePager(row);
}

export async function saveOnePagerEdit(args: {
  onePagerId: string;
  body: OnePagerBody;
  changeNote: string;
  personId: string;
}): Promise<OnePager> {
  const cur = await getOnePagerRow(args.onePagerId);
  const next = await insertOnePagerVersion(
    () => ({
      id: randomUUID(),
      team_id: cur.team_id,
      case_id: cur.case_id,
      body: args.body,
      previous_body: cur.body,
      change_note: args.changeNote,
      signed_off_by: [],
      drive_doc_id: null,
      drive_pdf_exported: false,
      origin_tag: "member",
      created_at: nowIso(),
      created_by: args.personId,
    }),
    cur.team_id,
    cur.case_id,
  );
  await recomputeRoadmapStages(args.personId);
  return next;
}

export async function signOffOnePager(args: {
  onePagerId: string;
  personId: string;
}): Promise<void> {
  const sb = getServiceSupabase();
  const cur = await getOnePagerRow(args.onePagerId);
  if (!cur.signed_off_by.includes(args.personId)) {
    assertOk(
      (
        await sb
          .from("one_pagers")
          .update({ signed_off_by: [...cur.signed_off_by, args.personId] })
          .eq("id", args.onePagerId)
      ).error,
      "signOffOnePager",
    );
  }
  await recomputeRoadmapStages(args.personId);
}

export async function exportOnePagerStub(
  onePagerId: string,
  personId: string,
): Promise<{ drive_doc_id: string; pdf: boolean; stub: boolean }> {
  const sb = getServiceSupabase();
  await getOnePagerRow(onePagerId);
  const docId = `stub-doc-${onePagerId.slice(0, 8)}`;
  assertOk(
    (
      await sb
        .from("one_pagers")
        .update({ drive_doc_id: docId, drive_pdf_exported: true })
        .eq("id", onePagerId)
    ).error,
    "exportOnePagerStub",
  );
  await logActivity({
    person_id: personId,
    action: "one_pager_drive_export_stub",
    target: onePagerId,
    meta: { drive_doc_id: docId },
  });
  return { drive_doc_id: docId, pdf: true, stub: true };
}

export async function latestOnePager(
  teamId: string,
  caseId: string,
): Promise<OnePager | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb
      .from("one_pagers")
      .select("*")
      .eq("team_id", teamId)
      .eq("case_id", caseId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "latestOnePager",
  );
  return row ? mapOnePager(row) : null;
}

export async function getOnePagerById(
  onePagerId: string,
): Promise<OnePager | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb.from("one_pagers").select("*").eq("id", onePagerId).maybeSingle(),
    "getOnePagerById",
  );
  return row ? mapOnePager(row) : null;
}

export async function listOnePagerVersions(
  teamId: string,
  caseId: string,
): Promise<OnePager[]> {
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("one_pagers")
        .select("*")
        .eq("team_id", teamId)
        .eq("case_id", caseId)
        .order("version", { ascending: false }),
      "listOnePagerVersions",
    ) ?? [];
  return rows.map((r: Row) => mapOnePager(r));
}

export async function onePagerDiff(onePagerId: string) {
  const sb = getServiceSupabase();
  const row = must(
    await sb.from("one_pagers").select("*").eq("id", onePagerId).maybeSingle(),
    "onePagerDiff",
  );
  if (!row) return [];
  const page = mapOnePager(row);
  return diffOnePagerBodies(page.previous_body, page.body);
}

// ---------- Moderator bank ----------

export async function pasteModeratorQuestions(args: {
  raw: string;
  caseId: string | null;
  personId: string;
  origin?: QuestionOrigin;
}): Promise<ModeratorQuestion[]> {
  const sb = getServiceSupabase();
  const caseRows =
    must(
      await sb
        .from("cases")
        .select("id,number,title,active")
        .order("number", { ascending: true }),
      "pasteModeratorQuestions.cases",
    ) ?? [];

  let fallbackCase: string | null = args.caseId;
  if (!fallbackCase) {
    fallbackCase =
      caseRows.find((c: Row) => c.active)?.id ?? caseRows[0]?.id ?? null;
  }
  if (!fallbackCase) throw new Error("no cases");

  const catalog = caseRows.map((c: Row) => ({
    id: c.id as string,
    number: c.number as number,
    title: c.title as string,
  }));

  const parts = await splitPasteWithCruxy({
    raw: args.raw,
    personId: args.personId,
    caseCatalog: catalog,
    defaultCaseId: fallbackCase,
  });
  if (parts.length === 0) return [];

  const person = must(
    await sb.from("people").select("id,name").eq("id", args.personId).maybeSingle(),
    "pasteModeratorQuestions.person",
  );
  const origin: QuestionOrigin = args.origin ?? "dr_b";
  const origin_label =
    origin === "dr_b"
      ? "Dr. B"
      : origin === "cruxy"
        ? "Cruxy"
        : person?.name ?? "member";

  const created: ModeratorQuestion[] = parts.map((part) => ({
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
  }));
  assertOk(
    (await sb.from("questions").insert(created)).error,
    "pasteModeratorQuestions.insert",
  );

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
}): Promise<void> {
  const sb = getServiceSupabase();
  if (args.questionIds.length > 0) {
    assertOk(
      (
        await sb
          .from("questions")
          .update({ status: "active" })
          .in("id", args.questionIds)
      ).error,
      "confirmModeratorQuestions.active",
    );
  }
  if (args.rejectIds && args.rejectIds.length > 0) {
    assertOk(
      (
        await sb
          .from("questions")
          .update({ status: "rejected" })
          .in("id", args.rejectIds)
      ).error,
      "confirmModeratorQuestions.rejected",
    );
  }
  await logActivity({
    person_id: args.personId,
    action: "moderator_confirm",
    target: args.questionIds[0] ?? args.rejectIds?.[0] ?? null,
    meta: {
      confirmed: args.questionIds.length,
      rejected: (args.rejectIds ?? []).length,
    },
  });
}

export async function listQuestions(filter?: {
  caseId?: string;
  status?: ModeratorQuestion["status"];
}): Promise<ModeratorQuestion[]> {
  const sb = getServiceSupabase();
  let q = sb.from("questions").select("*");
  if (filter?.caseId) q = q.eq("case_id", filter.caseId);
  if (filter?.status) q = q.eq("status", filter.status);
  const rows =
    must(await q.order("created_at", { ascending: true }), "listQuestions") ?? [];
  return rows.map(mapQuestion);
}

export async function serveQuestion(args: {
  personId: string;
  sessionKey: string;
  preferredCaseIds?: string[];
}): Promise<ModeratorQuestion | null> {
  const sb = getServiceSupabase();
  const cutoff = new Date(Date.now() - DRILL_SEEN_WINDOW_MS).toISOString();

  const [seenRes, answersRes, rolesRes, questionsRes] = await Promise.all([
    sb
      .from("drill_session_seen")
      .select("question_id")
      .eq("person_id", args.personId)
      .eq("session_key", args.sessionKey),
    sb
      .from("answers")
      .select("question_id,score")
      .eq("person_id", args.personId)
      .not("score", "is", null)
      .order("created_at", { ascending: true }),
    sb.from("case_roles").select("case_id").eq("person_id", args.personId),
    sb.from("questions").select("*").eq("status", "active"),
  ]);

  const seen = new Set<string>(
    (must(seenRes, "serveQuestion.seen") ?? []).map((r: Row) => r.question_id),
  );
  const scoresByQuestion = new Map<string, number[]>();
  for (const a of must(answersRes, "serveQuestion.answers") ?? []) {
    const arr = scoresByQuestion.get(a.question_id) ?? [];
    arr.push(a.score);
    scoresByQuestion.set(a.question_id, arr);
  }
  const roles = must(rolesRes, "serveQuestion.roles") ?? [];

  let preferred = args.preferredCaseIds;
  if (!preferred) {
    if (roles.length) {
      preferred = roles.map((r: Row) => r.case_id);
    } else {
      const active =
        must(
          await sb.from("cases").select("id").eq("active", true),
          "serveQuestion.cases",
        ) ?? [];
      preferred = active.map((c: Row) => c.id);
    }
  }

  const picked = pickWeightedQuestion({
    pool: (must(questionsRes, "serveQuestion.questions") ?? []).map(mapQuestion),
    seenInSession: seen,
    caseIdsPreferred: preferred,
    scoresByQuestion,
  });
  if (!picked) return null;

  assertOk(
    (
      await sb
        .from("drill_session_seen")
        .upsert(
          {
            person_id: args.personId,
            session_key: args.sessionKey,
            question_id: picked.id,
            seen_at: nowIso(),
          },
          { onConflict: "person_id,session_key,question_id" },
        )
    ).error,
    "serveQuestion.markSeen",
  );
  await sb
    .from("drill_session_seen")
    .delete()
    .eq("person_id", args.personId)
    .lt("seen_at", cutoff);

  return picked;
}

export async function answerQuestion(args: {
  questionId: string;
  personId: string;
  text: string;
  mode?: "typed" | "spoken";
  score?: number | null;
  feedback?: string | null;
}): Promise<QuestionAnswer> {
  const sb = getServiceSupabase();
  const [personRes, priorRes] = await Promise.all([
    sb.from("people").select("id,team_id").eq("id", args.personId).maybeSingle(),
    sb
      .from("answers")
      .select("score")
      .eq("question_id", args.questionId)
      .eq("person_id", args.personId)
      .order("created_at", { ascending: true }),
  ]);
  const person = must(personRes, "answerQuestion.person");
  const prior = must(priorRes, "answerQuestion.prior") ?? [];
  const firstScore: number | null | undefined = prior[0]?.score;

  let score = args.score;
  if (score == null) {
    score = Math.min(1, 0.4 + args.text.trim().split(/\s+/).length / 40);
  }

  const row: QuestionAnswer = {
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
  assertOk((await sb.from("answers").insert(row)).error, "answerQuestion.insert");

  await recomputeRoadmapStages(args.personId);

  await logActivity({
    person_id: args.personId,
    action: "moderator_answer",
    target: args.questionId,
    meta: { mode: args.mode ?? "typed", score },
  });

  if (row.score != null) {
    const qRow = must(
      await sb
        .from("questions")
        .select("case_id")
        .eq("id", args.questionId)
        .maybeSingle(),
      "answerQuestion.question",
    );
    if (qRow?.case_id) {
      const { observeClaimAttempt } = await import(
        "@/lib/cruxy/socratic-outcomes"
      );
      await observeClaimAttempt({
        personId: args.personId,
        caseId: qRow.case_id as string,
        attemptKind: "drill",
        scoreAfter: row.score,
        refId: row.id,
      }).catch(() => undefined);
    }
  }

  return row;
}

export async function bestTeamAnswer(
  questionId: string,
  teamId: string,
): Promise<QuestionAnswer | null> {
  const sb = getServiceSupabase();
  const row = must(
    await sb
      .from("answers")
      .select("*")
      .eq("question_id", questionId)
      .eq("team_id", teamId)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    "bestTeamAnswer",
  );
  return row ? mapAnswer(row) : null;
}

// ---------- Socratic + language + warm-up ----------

export async function listTeamCaseClaims(
  teamId: string,
  caseId: string,
): Promise<ClaimRow[]> {
  return teamCaseClaims(teamId, caseId);
}

async function teamCaseClaims(teamId: string, caseId: string): Promise<ClaimRow[]> {
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("claims")
        .select("*")
        .eq("team_id", teamId)
        .eq("case_id", caseId)
        .order("ord", { ascending: true })
        .order("created_at", { ascending: true }),
      "teamCaseClaims",
    ) ?? [];
  return rows.map(mapClaim);
}

export async function startSocraticDrill(args: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<SocraticSession> {
  const sb = getServiceSupabase();
  const claims = await teamCaseClaims(args.teamId, args.caseId);
  const { question, claimLinks } = await cruxySocraticOpening({
    claims,
    personId: args.personId,
  });

  const session: SocraticSession = {
    id: randomUUID(),
    person_id: args.personId,
    team_id: args.teamId,
    case_id: args.caseId,
    turns: [{ role: "cruxy", text: question, at: nowIso() }],
    summary: null,
    claim_links: claimLinks,
    status: "active",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  assertOk(
    (await sb.from("socratic_sessions").insert(session)).error,
    "startSocraticDrill",
  );
  await logActivity({
    person_id: args.personId,
    action: "socratic_start",
    target: args.caseId,
    meta: { teamId: args.teamId, sessionId: session.id },
  });
  return session;
}

export async function continueSocratic(args: {
  sessionId: string;
  personId: string;
  answer: string;
}): Promise<SocraticSession> {
  const sb = getServiceSupabase();
  const row = must(
    await sb
      .from("socratic_sessions")
      .select("*")
      .eq("id", args.sessionId)
      .maybeSingle(),
    "continueSocratic.find",
  );
  if (!row) throw new Error("session not found");
  const cur = mapSocratic(row);
  // Personal Socratic transcript: only the owner may continue.
  if (cur.person_id !== args.personId) {
    throw new Error("That Socratic session belongs to someone else.");
  }

  cur.turns.push({ role: "person", text: args.answer, at: nowIso() });
  const claims = await teamCaseClaims(cur.team_id, cur.case_id);
  const next = await cruxySocraticAfterAnswer({
    claims,
    turns: cur.turns,
    personId: args.personId,
  });
  if (next.status === "done") {
    cur.summary = next.summary;
    cur.status = "done";
  } else {
    cur.turns.push({
      role: "cruxy",
      text: next.question,
      at: nowIso(),
    });
  }
  cur.updated_at = nowIso();

  assertOk(
    (
      await sb
        .from("socratic_sessions")
        .update({
          turns: cur.turns,
          summary: cur.summary,
          status: cur.status,
          updated_at: cur.updated_at,
        })
        .eq("id", cur.id)
    ).error,
    "continueSocratic.update",
  );
  if (cur.status === "done") {
    const { openSocraticOutcomes } = await import(
      "@/lib/cruxy/socratic-outcomes"
    );
    await openSocraticOutcomes(cur).catch(() => undefined);
  }
  await logActivity({
    person_id: args.personId,
    action: "socratic_turn",
    target: args.sessionId,
    meta: { status: cur.status },
  });
  return cur;
}

export async function languageSuggestions(args: {
  personId: string;
  teamId: string;
  caseId: string;
  claimId?: string;
}) {
  const sb = getServiceSupabase();
  const teamClaims = await teamCaseClaims(args.teamId, args.caseId);
  let claim: ClaimRow | undefined = teamClaims[0];
  if (args.claimId) {
    claim = teamClaims.find((c) => c.id === args.claimId) ?? claim;
  }
  const truth = (
    must(
      await sb
        .from("truth_items")
        .select("*")
        .eq("team_id", args.teamId)
        .eq("case_id", args.caseId)
        .order("created_at", { ascending: true }),
      "languageSuggestions.truth",
    ) ?? []
  ).map(mapTruth);

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
}): Promise<PhrasebookEntry> {
  const sb = getServiceSupabase();
  const row: PhrasebookEntry = {
    id: randomUUID(),
    person_id: args.personId,
    case_id: args.caseId,
    claim_ref: args.claimRef,
    text: args.text,
    kind: args.kind,
    created_at: nowIso(),
  };
  assertOk((await sb.from("phrasebook_entries").insert(row)).error, "savePhrase");
  await logActivity({
    person_id: args.personId,
    action: "phrasebook_save",
    target: args.caseId,
    meta: { kind: args.kind },
  });
  return row;
}

export async function listPhrasebook(personId: string): Promise<PhrasebookEntry[]> {
  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("phrasebook_entries")
        .select("*")
        .eq("person_id", personId)
        .order("created_at", { ascending: true }),
      "listPhrasebook",
    ) ?? [];
  return rows.map(mapPhrase);
}

export async function buildWarmUp(
  personId: string,
  opts?: { caseId?: string },
) {
  await autoAssignLeadDecks(personId);
  const due = await dueFlashcardsForPerson(personId);
  const scoped = opts?.caseId
    ? due.filter((d) => d.card.case_id === opts.caseId)
    : due;
  const pool = scoped.length ? scoped : due;
  const cards = pool.slice(0, 5).map((d) => d.card);
  const sessionKey = `warmup-${personId}-${Date.now()}`;
  const preferred = opts?.caseId ? [opts.caseId] : undefined;
  const q1 = await serveQuestion({
    personId,
    sessionKey,
    preferredCaseIds: preferred,
  });
  const q2 = await serveQuestion({
    personId,
    sessionKey,
    preferredCaseIds: preferred,
  });
  return {
    flashcards: cards,
    moderator_questions: [q1, q2].filter(Boolean),
    counterclaim_prompt:
      "Out loud: concede, distinguish, then rebut your case's main counterclaim in under 90 seconds.",
    minutes: 10,
    caseId: opts?.caseId ?? null,
  };
}

// ---------- Roadmap ----------

/** Keeps the oldest row per (case, stage); extras can appear if two requests seed at once. */
function splitDuplicateStages(rows: RoadmapStage[]) {
  const keep = new Map<string, RoadmapStage>();
  const extras: string[] = [];
  for (const r of [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )) {
    const key = `${r.case_id}:${r.stage}`;
    if (keep.has(key)) extras.push(r.id);
    else keep.set(key, r);
  }
  return { kept: [...keep.values()], extras };
}

export async function ensureRoadmapForPerson(personId: string): Promise<void> {
  const sb = getServiceSupabase();
  const person = must(
    await sb.from("people").select("id").eq("id", personId).maybeSingle(),
    "ensureRoadmap.person",
  );
  if (!person) return;

  const [casesRes, stagesRes, rolesRes, optInRes, compRes] = await Promise.all([
    sb.from("cases").select("id").eq("active", true),
    sb.from("roadmap_stages").select("*").eq("person_id", personId),
    sb.from("case_roles").select("case_id,role").eq("person_id", personId),
    sb.from("deck_opt_ins").select("case_id").eq("person_id", personId),
    sb
      .from("competitions")
      .select("date")
      .order("date", { ascending: true })
      .limit(1),
  ]);
  const activeCases = must(casesRes, "ensureRoadmap.cases") ?? [];
  const { kept, extras } = splitDuplicateStages(
    (must(stagesRes, "ensureRoadmap.stages") ?? []).map(mapStage),
  );
  if (extras.length > 0) {
    await sb.from("roadmap_stages").delete().in("id", extras);
  }
  const existing = new Map(kept.map((r) => [`${r.case_id}:${r.stage}`, r]));

  const rolesByCase = new Map<string, CaseRoleRow["role"][]>();
  for (const role of must(rolesRes, "ensureRoadmap.roles") ?? []) {
    const arr = rolesByCase.get(role.case_id) ?? [];
    arr.push(role.role);
    rolesByCase.set(role.case_id, arr);
  }
  const optIn = new Set<string>(
    (must(optInRes, "ensureRoadmap.optIns") ?? []).map((d: Row) => d.case_id),
  );
  const competition =
    (must(compRes, "ensureRoadmap.competition") ?? [])[0]?.date ?? "2026-12-05";

  const built = buildRoadmapForPerson({
    personId,
    caseIds: activeCases.map((c: Row) => c.id),
    rolesByCase,
    flashcardOptInCases: optIn,
    competitionDate: competition,
  });

  const inserts: RoadmapStage[] = [];
  for (const row of built) {
    const cur = existing.get(`${row.case_id}:${row.stage}`);
    if (!cur) {
      inserts.push(row);
    } else if (cur.required !== row.required || cur.due !== row.due) {
      assertOk(
        (
          await sb
            .from("roadmap_stages")
            .update({ required: row.required, due: row.due })
            .eq("id", cur.id)
        ).error,
        "ensureRoadmap.update",
      );
    }
  }
  if (inserts.length > 0) {
    assertOk(
      (await sb.from("roadmap_stages").insert(inserts)).error,
      "ensureRoadmap.insert",
    );
  }
}

type StageSnapshot = {
  teamId: string | null;
  reading: { case_id: string; opened_ratio: number }[];
  mapReviews: { case_id: string; claim_id: string | null; kind: string }[];
  claims: { id: string; case_id: string }[];
  onePagers: {
    case_id: string;
    version: number;
    body: OnePagerBody | null;
    signed_off_by: string[];
  }[];
  flashcards: { id: string; case_id: string | null }[];
  cardReviews: { card_id: string; grade: number }[];
  activeQuestions: { id: string; case_id: string }[];
  answers: { question_id: string; score: number | null }[];
  speakLogs: { case_id: string; spoken: boolean }[];
  judgeAttempts: { case_id: string; score: number; created_at: string }[];
};

async function loadStageSnapshot(personId: string): Promise<StageSnapshot> {
  const sb = getServiceSupabase();
  const person = must(
    await sb.from("people").select("id,team_id").eq("id", personId).maybeSingle(),
    "stageSnapshot.person",
  );
  const teamId: string | null = person?.team_id ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (q: any) => (teamId ? q.eq("team_id", teamId) : q);
  const run = async (
    p: PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    ctx: string,
  ): Promise<Row[]> => must(await p, ctx) ?? [];

  const [
    reading,
    mapReviews,
    claims,
    onePagers,
    flashcards,
    cardReviews,
    questions,
    answers,
    speakLogs,
    judgeAttempts,
  ] = await Promise.all([
    run(
      sb
        .from("reading_progress")
        .select("case_id,opened_ratio")
        .eq("person_id", personId),
      "stageSnapshot.reading",
    ),
    run(
      sb
        .from("map_reviews")
        .select("case_id,claim_id,kind")
        .eq("person_id", personId),
      "stageSnapshot.mapReviews",
    ),
    run(scoped(sb.from("claims").select("id,case_id")), "stageSnapshot.claims"),
    run(
      scoped(sb.from("one_pagers").select("case_id,version,body,signed_off_by")),
      "stageSnapshot.onePagers",
    ),
    run(
      scoped(sb.from("flashcards").select("id,case_id")),
      "stageSnapshot.flashcards",
    ),
    run(
      sb.from("card_reviews").select("card_id,grade").eq("person_id", personId),
      "stageSnapshot.cardReviews",
    ),
    run(
      sb.from("questions").select("id,case_id").eq("status", "active"),
      "stageSnapshot.questions",
    ),
    run(
      sb
        .from("answers")
        .select("question_id,score")
        .eq("person_id", personId)
        .order("created_at", { ascending: true }),
      "stageSnapshot.answers",
    ),
    run(
      sb
        .from("practice_speak_logs")
        .select("case_id,spoken")
        .eq("person_id", personId),
      "stageSnapshot.speakLogs",
    ),
    run(
      sb
        .from("judge_attempts")
        .select("case_id,score,created_at")
        .eq("person_id", personId)
        .order("created_at", { ascending: true }),
      "stageSnapshot.judgeAttempts",
    ),
  ]);

  return {
    teamId,
    reading: reading as StageSnapshot["reading"],
    mapReviews: mapReviews as StageSnapshot["mapReviews"],
    claims: claims as StageSnapshot["claims"],
    onePagers: onePagers.map((o) => ({
      case_id: o.case_id,
      version: o.version,
      body: o.body ?? null,
      signed_off_by: o.signed_off_by ?? [],
    })),
    flashcards: flashcards as StageSnapshot["flashcards"],
    cardReviews: cardReviews as StageSnapshot["cardReviews"],
    activeQuestions: questions as StageSnapshot["activeQuestions"],
    answers: answers as StageSnapshot["answers"],
    speakLogs: speakLogs as StageSnapshot["speakLogs"],
    judgeAttempts: judgeAttempts as StageSnapshot["judgeAttempts"],
  };
}

function isStageDone(
  snap: StageSnapshot,
  personId: string,
  caseId: string,
  stage: RoadmapStageId,
): boolean {
  switch (stage) {
    case "read": {
      const progress = snap.reading.filter((r) => r.case_id === caseId);
      if (progress.length === 0) return false;
      return progress.every((p) => p.opened_ratio >= 0.6);
    }
    case "map": {
      const claims = snap.claims.filter((c) => c.case_id === caseId);
      if (claims.length === 0) return false;
      const reviews = snap.mapReviews.filter((m) => m.case_id === caseId);
      return claims.every(
        (c) =>
          reviews.some((r) => r.claim_id === c.id) ||
          reviews.some((r) => r.kind === "reviewed_all"),
      );
    }
    case "one_pager": {
      const page = snap.onePagers
        .filter((o) => o.case_id === caseId)
        .sort((a, b) => b.version - a.version)[0];
      if (!page || !page.body) return false;
      if ((page.body.empty_rows ?? []).length > 0) return false;
      return page.signed_off_by.includes(personId);
    }
    case "flashcards": {
      const cards = snap.flashcards.filter((c) => c.case_id === caseId);
      return flashcardStageComplete(
        snap.cardReviews,
        cards.map((c) => c.id),
      );
    }
    case "question_drill": {
      const qIds = new Set(
        snap.activeQuestions.filter((q) => q.case_id === caseId).map((q) => q.id),
      );
      const answers = snap.answers.filter((a) => qIds.has(a.question_id));
      if (answers.length < 10) return false;
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
      return snap.speakLogs.some((p) => p.case_id === caseId && p.spoken);
    case "judged": {
      const attempts = snap.judgeAttempts
        .filter((j) => j.case_id === caseId)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      if (attempts.length < 2) return false;
      return attempts[attempts.length - 1].score > attempts[0].score;
    }
    default:
      return false;
  }
}

export async function recomputeRoadmapStages(personId: string): Promise<void> {
  const sb = getServiceSupabase();
  await ensureRoadmapForPerson(personId);
  const stages = (
    must(
      await sb.from("roadmap_stages").select("*").eq("person_id", personId),
      "recomputeRoadmap.stages",
    ) ?? []
  ).map(mapStage);
  const pending = stages.filter((s) => !s.done_at);
  if (pending.length === 0) return;

  const snap = await loadStageSnapshot(personId);
  const doneIds = pending
    .filter((s) => isStageDone(snap, personId, s.case_id, s.stage as RoadmapStageId))
    .map((s) => s.id);
  if (doneIds.length === 0) return;
  assertOk(
    (
      await sb
        .from("roadmap_stages")
        .update({ done_at: nowIso() })
        .in("id", doneIds)
        .is("done_at", null)
    ).error,
    "recomputeRoadmap.update",
  );
}

export async function recordReadingProgress(args: {
  personId: string;
  caseId: string;
  fileId: string;
  openedRatio: number;
}): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("reading_progress").upsert(
        {
          person_id: args.personId,
          case_id: args.caseId,
          file_id: args.fileId,
          opened_ratio: args.openedRatio,
          updated_at: nowIso(),
        },
        { onConflict: "person_id,case_id,file_id" },
      )
    ).error,
    "recordReadingProgress",
  );
  await recomputeRoadmapStages(args.personId);
}

export async function recordMapReview(args: {
  personId: string;
  teamId: string;
  caseId: string;
  claimId?: string | null;
  kind?: string;
}): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("map_reviews").insert({
        id: randomUUID(),
        person_id: args.personId,
        team_id: args.teamId,
        case_id: args.caseId,
        claim_id: args.claimId ?? null,
        kind: args.kind ?? "reviewed",
        created_at: nowIso(),
      })
    ).error,
    "recordMapReview",
  );
  await recomputeRoadmapStages(args.personId);
}

export async function recordPracticeSpeak(args: {
  personId: string;
  caseId: string;
}): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("practice_speak_logs").insert({
        id: randomUUID(),
        person_id: args.personId,
        case_id: args.caseId,
        round_id: null,
        spoken: true,
        created_at: nowIso(),
      })
    ).error,
    "recordPracticeSpeak",
  );
  await recomputeRoadmapStages(args.personId);
}

export async function recordJudgeAttempt(args: {
  personId: string;
  caseId: string;
  score: number;
}): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb.from("judge_attempts").insert({
        id: randomUUID(),
        person_id: args.personId,
        case_id: args.caseId,
        score: args.score,
        created_at: nowIso(),
      })
    ).error,
    "recordJudgeAttempt",
  );
  await recomputeRoadmapStages(args.personId);
}

export async function getRoadmapView(personId: string) {
  const sb = getServiceSupabase();
  await ensureRoadmapForPerson(personId);
  await recomputeRoadmapStages(personId);

  const [stagesRes, casesRes, compRes] = await Promise.all([
    sb.from("roadmap_stages").select("*").eq("person_id", personId),
    sb.from("cases").select("*").order("number", { ascending: true }),
    sb
      .from("competitions")
      .select("date")
      .order("date", { ascending: true })
      .limit(1),
  ]);
  const stages = splitDuplicateStages(
    (must(stagesRes, "getRoadmapView.stages") ?? []).map(mapStage),
  ).kept;
  const allCases = (must(casesRes, "getRoadmapView.cases") ?? []).map(mapCase);
  const caseTitles = new Map(
    allCases.map((c: CaseRow) => [
      c.id,
      `${String(c.number).padStart(2, "0")} ${c.title}`,
    ]),
  );
  const byCase = new Map<string, RoadmapStage[]>();
  for (const s of stages) {
    const arr = byCase.get(s.case_id) ?? [];
    arr.push(s);
    byCase.set(s.case_id, arr);
  }
  const cases = allCases
    .filter((c: CaseRow) => c.active)
    .map((c: CaseRow) => ({
      case: c,
      stages: byCase.get(c.id) ?? [],
      readiness: readinessForCase(byCase.get(c.id) ?? []),
    }));

  return {
    cases,
    doNext: doNextActions(stages, caseTitles, 3),
    competitionDate:
      (must(compRes, "getRoadmapView.competition") ?? [])[0]?.date ?? "2026-12-05",
  };
}

export async function studyingLabels(personId: string): Promise<string[]> {
  const sb = getServiceSupabase();
  const [rolesRes, optInRes, casesRes] = await Promise.all([
    sb
      .from("case_roles")
      .select("case_id")
      .eq("person_id", personId)
      .in("role", ["lead_1", "lead_2"]),
    sb
      .from("deck_opt_ins")
      .select("case_id,assigned")
      .eq("person_id", personId)
      .eq("assigned", false),
    sb.from("cases").select("id,number"),
  ]);
  const assigned = new Set<string>(
    (must(rolesRes, "studyingLabels.roles") ?? []).map((r: Row) => r.case_id),
  );
  const cases = must(casesRes, "studyingLabels.cases") ?? [];
  return (must(optInRes, "studyingLabels.optIns") ?? [])
    .filter((d: Row) => !assigned.has(d.case_id))
    .map((d: Row) => {
      const c = cases.find((x: Row) => x.id === d.case_id);
      return c
        ? `studying Case ${c.number} (not assigned)`
        : "studying a case (not assigned)";
    });
}

export async function listCasesAndTeams(): Promise<{
  cases: CaseRow[];
  teams: Team[];
  people: Person[];
  case_roles: CaseRoleRow[];
}> {
  const sb = getServiceSupabase();
  const [casesRes, teamsRes, peopleRes, rolesRes] = await Promise.all([
    sb
      .from("cases")
      .select("*")
      .eq("active", true)
      .order("number", { ascending: true }),
    sb
      .from("teams")
      .select("*")
      .order("created_at", { ascending: true })
      .order("name", { ascending: true }),
    sb
      .from("people")
      .select("id,name,team_id,role,created_at,last_sign_in_at")
      .order("created_at", { ascending: true }),
    sb.from("case_roles").select("*").order("created_at", { ascending: true }),
  ]);
  return {
    cases: (must(casesRes, "listCasesAndTeams.cases") ?? []).map(mapCase),
    teams: (must(teamsRes, "listCasesAndTeams.teams") ?? []).map(
      (t: Row): Team => ({
        id: t.id,
        name: t.name,
        colour: t.colour,
        created_at: iso(t.created_at),
      }),
    ),
    // Only the safe columns are read; auth fields are filled with inert defaults.
    people: (must(peopleRes, "listCasesAndTeams.people") ?? []).map(
      (p: Row): Person => ({
        id: p.id,
        name: p.name,
        team_id: p.team_id ?? null,
        role: p.role,
        email: null,
        email_reminders_opt_in: false,
        digest_opt_in: false,
        consent_version: null,
        consent_at: null,
        recording_ok: false,
        voice_sample_path: null,
        pronunciation_note: null,
        first_run_checklist: {},
        failed_attempts: 0,
        locked_until: null,
        last_sign_in_at: isoOrNull(p.last_sign_in_at),
        created_at: iso(p.created_at),
        created_by: null,
      }),
    ),
    case_roles: (must(rolesRes, "listCasesAndTeams.roles") ?? []).map(
      (r: Row): CaseRoleRow => ({
        id: r.id,
        team_id: r.team_id,
        case_id: r.case_id,
        person_id: r.person_id,
        role: r.role,
        created_at: iso(r.created_at),
        created_by: r.created_by ?? null,
      }),
    ),
  };
}
