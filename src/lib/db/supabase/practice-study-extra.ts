/**
 * Practice study: sync role decks from one-pagers; solo Q sessions.
 */
import "server-only";

import { createHash, randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { getPersonById, listCases, logActivity } from "@/lib/db/repository";
import { latestOnePager } from "@/lib/revision/repository";
import type { Flashcard } from "@/lib/revision/types";
import type { CaseRoleKind } from "@/lib/case-brain/types";
import {
  STUDY_DECK_META,
  cardsFromOnePager,
  counterCardsFromOnePager,
  deepCardsFromOnePager,
  sanitizeCardText,
  type StudyCardDraft,
  type StudyDeckKind,
} from "@/lib/practice/study-decks";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { nowIso } from "@/lib/utils";

export type SoloQaKind = "moderator" | "judges";
export type SoloQaStatus = "active" | "done";

export type SoloQaItem = {
  questionId: string | null;
  prompt: string;
  answer: string | null;
  feedback: string | null;
  appeNotes: string | null;
  answeredAt: string | null;
};

export type SoloQaSession = {
  id: string;
  person_id: string;
  team_id: string;
  case_id: string;
  kind: SoloQaKind;
  status: SoloQaStatus;
  current_index: number;
  items: SoloQaItem[];
  created_at: string;
  updated_at: string;
};

type SampleBag = {
  flashcards: Flashcard[];
  case_roles: {
    person_id: string;
    team_id: string;
    case_id: string;
    role: CaseRoleKind;
  }[];
  card_fsrs_states: {
    person_id: string;
    card_id: string;
    due: string;
  }[];
  solo_qa_sessions?: SoloQaSession[];
};

function stableId(key: string): string {
  const h = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function draftToCard(
  teamId: string,
  caseId: string,
  draft: StudyCardDraft,
  personId: string | null,
): Flashcard {
  const now = nowIso();
  return {
    id: stableId(draft.key),
    team_id: teamId,
    case_id: caseId,
    deck: draft.deck,
    front: sanitizeCardText(draft.front),
    back: sanitizeCardText(draft.back),
    citation_ids: [],
    truth_item_id: null,
    claim_id: null,
    source_kind: "case_card",
    created_at: now,
    created_by: personId,
    updated_at: now,
  };
}

async function rolesForPerson(personId: string) {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.case_roles.filter((r) => r.person_id === personId);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("case_roles")
    .select("person_id,team_id,case_id,role")
    .eq("person_id", personId);
  assertOk(error, "rolesForPerson");
  return (data ?? []) as {
    person_id: string;
    team_id: string;
    case_id: string;
    role: CaseRoleKind;
  }[];
}

/** Rebuild case_card flashcards for the person's team from latest one-pagers. */
export async function syncPracticeStudyCards(personId: string): Promise<{
  upserted: number;
}> {
  const person = await getPersonById(personId);
  const teamId = person?.team_id;
  if (!teamId) return { upserted: 0 };

  const cases = (await listCases()).filter((c) => c.active);
  const roles = await rolesForPerson(personId);
  const leadCases = new Set(
    roles
      .filter((r) => r.role === "lead_1" || r.role === "lead_2")
      .map((r) => r.case_id),
  );
  const counterCases = new Set(
    roles.filter((r) => r.role === "counter_arguer").map((r) => r.case_id),
  );
  const supportCases = new Set(
    roles.filter((r) => r.role === "supporter").map((r) => r.case_id),
  );

  const nextCards: Flashcard[] = [];
  for (const c of cases) {
    const page = await latestOnePager(teamId, c.id);
    if (!page) continue;
    const label = `Case ${c.number}`;
    const body = page.body;

    for (const d of cardsFromOnePager(
      teamId,
      c.id,
      label,
      body,
      "everyone",
    )) {
      nextCards.push(draftToCard(teamId, c.id, d, personId));
    }
    if (leadCases.has(c.id)) {
      for (const d of deepCardsFromOnePager(teamId, c.id, label, body)) {
        nextCards.push(draftToCard(teamId, c.id, d, personId));
      }
    }
    if (counterCases.has(c.id)) {
      for (const d of counterCardsFromOnePager(teamId, c.id, label, body)) {
        nextCards.push(draftToCard(teamId, c.id, d, personId));
      }
    }
    if (supportCases.has(c.id)) {
      for (const d of cardsFromOnePager(teamId, c.id, label, body, "support")) {
        nextCards.push(draftToCard(teamId, c.id, d, personId));
      }
    }
  }

  // Dedupe by id
  const byId = new Map<string, Flashcard>();
  for (const card of nextCards) byId.set(card.id, card);
  const unique = [...byId.values()];

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBag;
      bag.flashcards = [
        ...bag.flashcards.filter(
          (f) =>
            !(
              f.team_id === teamId &&
              f.source_kind === "case_card" &&
              (f.deck === "lead" ||
                f.deck === "counter" ||
                f.deck === "support" ||
                f.deck === "everyone")
            ),
        ),
        ...unique,
      ];
    });
  } else {
    const sb = getServiceSupabase();
    // Remove prior practice study cards for this team, then upsert.
    assertOk(
      (
        await sb
          .from("flashcards")
          .delete()
          .eq("team_id", teamId)
          .eq("source_kind", "case_card")
          .in("deck", ["lead", "counter", "support", "everyone"])
      ).error,
      "syncPracticeStudyCards.delete",
    );
    if (unique.length) {
      assertOk(
        (await sb.from("flashcards").upsert(unique, { onConflict: "id" })).error,
        "syncPracticeStudyCards.upsert",
      );
    }
  }

  await logActivity({
    person_id: personId,
    action: "practice_study_cards_synced",
    target: teamId,
    meta: { count: unique.length },
  });

  return { upserted: unique.length };
}

export type StudyDeckSummary = {
  kind: StudyDeckKind;
  title: string;
  blurb: string;
  dueToday: number;
  total: number;
  caseIds: string[];
};

export async function listStudyDecksForPerson(
  personId: string,
): Promise<StudyDeckSummary[]> {
  await syncPracticeStudyCards(personId);
  const roles = await rolesForPerson(personId);
  const lead = new Set(
    roles
      .filter((r) => r.role === "lead_1" || r.role === "lead_2")
      .map((r) => r.case_id),
  );
  const counter = new Set(
    roles.filter((r) => r.role === "counter_arguer").map((r) => r.case_id),
  );
  const support = new Set(
    roles.filter((r) => r.role === "supporter").map((r) => r.case_id),
  );

  let cards: Flashcard[] = [];
  let states: { card_id: string; due: string }[] = [];

  if (isSampleDataMode()) {
    const store = (await readStore()) as SampleBag;
    cards = store.flashcards.filter(
      (c) =>
        c.source_kind === "case_card" &&
        (c.deck === "lead" ||
          c.deck === "counter" ||
          c.deck === "support" ||
          c.deck === "everyone"),
    );
    states = store.card_fsrs_states
      .filter((s) => s.person_id === personId)
      .map((s) => ({ card_id: s.card_id, due: s.due }));
  } else {
    const sb = getServiceSupabase();
    const { data: cardRows, error: cErr } = await sb
      .from("flashcards")
      .select("*")
      .eq("source_kind", "case_card")
      .in("deck", ["lead", "counter", "support", "everyone"]);
    assertOk(cErr, "listStudyDecks.cards");
    cards = (cardRows ?? []).map((r) => ({
      id: r.id,
      team_id: r.team_id,
      case_id: r.case_id,
      deck: r.deck,
      front: r.front,
      back: r.back,
      citation_ids: r.citation_ids ?? [],
      truth_item_id: r.truth_item_id,
      claim_id: r.claim_id,
      source_kind: r.source_kind,
      created_at: r.created_at,
      created_by: r.created_by,
      updated_at: r.updated_at,
    }));
    const { data: stRows, error: sErr } = await sb
      .from("card_fsrs_states")
      .select("card_id,due")
      .eq("person_id", personId);
    assertOk(sErr, "listStudyDecks.states");
    states = (stRows ?? []) as { card_id: string; due: string }[];
  }

  const dueByCard = new Map(states.map((s) => [s.card_id, s.due]));
  const now = Date.now();

  function summarize(
    kind: StudyDeckKind,
    filter: (c: Flashcard) => boolean,
  ): StudyDeckSummary {
    const meta = STUDY_DECK_META.find((m) => m.kind === kind)!;
    const subset = cards.filter(
      (c) => c.deck === kind && filter(c) && Boolean(c.case_id),
    );
    let dueToday = 0;
    for (const c of subset) {
      const due = dueByCard.get(c.id);
      if (!due || new Date(due).getTime() <= now) dueToday += 1;
    }
    return {
      kind,
      title: meta.title,
      blurb: meta.blurb,
      dueToday,
      total: subset.length,
      caseIds: [...new Set(subset.map((c) => c.case_id!).filter(Boolean))],
    };
  }

  return [
    summarize("lead", (c) => Boolean(c.case_id && lead.has(c.case_id))),
    summarize("counter", (c) => Boolean(c.case_id && counter.has(c.case_id))),
    summarize("support", (c) => Boolean(c.case_id && support.has(c.case_id))),
    summarize("everyone", () => true),
  ].filter((d) => d.kind === "everyone" || d.total > 0 || d.caseIds.length > 0);
}

export async function dueCardsForStudyDeck(args: {
  personId: string;
  deck: StudyDeckKind;
  caseId?: string | null;
}): Promise<{ card: Flashcard; state: { due?: string } | null }[]> {
  await syncPracticeStudyCards(args.personId);
  const roles = await rolesForPerson(args.personId);
  const allowedCases = new Set<string>();
  if (args.deck === "everyone") {
    // all
  } else if (args.deck === "lead") {
    for (const r of roles) {
      if (r.role === "lead_1" || r.role === "lead_2") allowedCases.add(r.case_id);
    }
  } else if (args.deck === "counter") {
    for (const r of roles) {
      if (r.role === "counter_arguer") allowedCases.add(r.case_id);
    }
  } else if (args.deck === "support") {
    for (const r of roles) {
      if (r.role === "supporter") allowedCases.add(r.case_id);
    }
  }

  let cards: Flashcard[] = [];
  let states: { card_id: string; due: string }[] = [];
  if (isSampleDataMode()) {
    const store = (await readStore()) as SampleBag;
    cards = store.flashcards.filter((c) => c.deck === args.deck);
    states = store.card_fsrs_states
      .filter((s) => s.person_id === args.personId)
      .map((s) => ({ card_id: s.card_id, due: s.due }));
  } else {
    const sb = getServiceSupabase();
    let q = sb
      .from("flashcards")
      .select("*")
      .eq("deck", args.deck)
      .eq("source_kind", "case_card");
    if (args.caseId) q = q.eq("case_id", args.caseId);
    const { data, error } = await q;
    assertOk(error, "dueCardsForStudyDeck.cards");
    cards = (data ?? []) as Flashcard[];
    const { data: st, error: sErr } = await sb
      .from("card_fsrs_states")
      .select("card_id,due")
      .eq("person_id", args.personId);
    assertOk(sErr, "dueCardsForStudyDeck.states");
    states = (st ?? []) as { card_id: string; due: string }[];
  }

  const dueMap = new Map(states.map((s) => [s.card_id, s.due]));
  const now = Date.now();
  const out: { card: Flashcard; state: { due?: string } | null }[] = [];
  for (const c of cards) {
    if (args.caseId && c.case_id !== args.caseId) continue;
    if (args.deck !== "everyone" && c.case_id && !allowedCases.has(c.case_id)) {
      continue;
    }
    const due = dueMap.get(c.id);
    if (due && new Date(due).getTime() > now) continue;
    out.push({ card: c, state: due ? { due } : null });
  }
  return out;
}

// ---------- Solo Q sessions ----------

export async function listActiveSoloQa(
  personId: string,
): Promise<SoloQaSession[]> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as SampleBag;
    return (store.solo_qa_sessions ?? []).filter(
      (s) => s.person_id === personId && s.status === "active",
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("solo_qa_sessions")
    .select("*")
    .eq("person_id", personId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  assertOk(error, "listActiveSoloQa");
  return (data ?? []) as SoloQaSession[];
}

export async function getSoloQaSession(
  id: string,
): Promise<SoloQaSession | null> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as SampleBag;
    return (store.solo_qa_sessions ?? []).find((s) => s.id === id) ?? null;
  }
  const { data, error } = await getServiceSupabase()
    .from("solo_qa_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertOk(error, "getSoloQaSession");
  return (data as SoloQaSession) ?? null;
}

export async function startSoloQaSession(args: {
  personId: string;
  teamId: string;
  caseId: string;
  kind: SoloQaKind;
  prompts: { questionId: string | null; prompt: string }[];
}): Promise<SoloQaSession> {
  const now = nowIso();
  const row: SoloQaSession = {
    id: randomUUID(),
    person_id: args.personId,
    team_id: args.teamId,
    case_id: args.caseId,
    kind: args.kind,
    status: "active",
    current_index: 0,
    items: args.prompts.map((p) => ({
      questionId: p.questionId,
      prompt: p.prompt,
      answer: null,
      feedback: null,
      appeNotes: null,
      answeredAt: null,
    })),
    created_at: now,
    updated_at: now,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBag;
      if (!bag.solo_qa_sessions) bag.solo_qa_sessions = [];
      bag.solo_qa_sessions.unshift(row);
    });
  } else {
    assertOk(
      (await getServiceSupabase().from("solo_qa_sessions").insert(row)).error,
      "startSoloQaSession",
    );
  }

  await logActivity({
    person_id: args.personId,
    action: "solo_qa_started",
    target: row.id,
    meta: { kind: args.kind, case_id: args.caseId },
  });
  return row;
}

export async function answerSoloQaItem(args: {
  sessionId: string;
  personId: string;
  answer: string;
  onePagerHint?: string | null;
}): Promise<SoloQaSession> {
  const session = await getSoloQaSession(args.sessionId);
  if (!session || session.person_id !== args.personId) {
    throw new Error("Session not found");
  }
  const item = session.items[session.current_index];
  if (!item) throw new Error("No question left");

  const feedback = await soloQaAppeFeedback({
    personId: args.personId,
    prompt: item.prompt,
    answer: args.answer,
    kind: session.kind,
    onePagerHint: args.onePagerHint ?? null,
  });

  item.answer = args.answer;
  item.feedback = feedback.feedback;
  item.appeNotes = feedback.appeNotes;
  item.answeredAt = nowIso();

  const nextIndex = session.current_index + 1;
  const done = nextIndex >= session.items.length;
  session.current_index = Math.min(nextIndex, session.items.length);
  session.status = done ? "done" : "active";
  session.updated_at = nowIso();

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as SampleBag;
      const list = bag.solo_qa_sessions ?? [];
      const i = list.findIndex((x) => x.id === session.id);
      if (i >= 0) list[i] = session;
    });
  } else {
    assertOk(
      (
        await getServiceSupabase()
          .from("solo_qa_sessions")
          .update({
            items: session.items,
            current_index: session.current_index,
            status: session.status,
            updated_at: session.updated_at,
          })
          .eq("id", session.id)
      ).error,
      "answerSoloQaItem",
    );
  }

  await logActivity({
    person_id: args.personId,
    action: "solo_qa_answered",
    target: session.id,
    meta: { index: session.current_index - 1 },
  });

  return session;
}

async function soloQaAppeFeedback(args: {
  personId: string;
  prompt: string;
  answer: string;
  kind: SoloQaKind;
  onePagerHint: string | null;
}): Promise<{ feedback: string; appeNotes: string }> {
  try {
    const result = await callCruxy({
      feature: "practice_solo_qa",
      tier: "small",
      personId: args.personId,
      estimatedCostUsd: 0.02,
      messages: [
        {
          role: "system",
          content:
            "You are Cruxy helping an Ethics Bowl competitor practise. Score the answer against the APPE card: clarity, moral dimensions, other viewpoints, and (for judges' Q&A) concise reply under 45 seconds. Be short. Plain words. No model names. Reply as JSON: {\"feedback\":\"...\",\"appeNotes\":\"...\"}.",
        },
        {
          role: "user",
          content: [
            `Kind: ${args.kind}`,
            `Question: ${args.prompt}`,
            `Answer: ${args.answer}`,
            args.onePagerHint
              ? `Team one-pager hint:\n${args.onePagerHint.slice(0, 1200)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    if (!result.ok) {
      throw new Error(result.reason || "Cruxy refused");
    }
    const text = result.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as {
        feedback?: string;
        appeNotes?: string;
      };
      return {
        feedback: parsed.feedback?.trim() || text.slice(0, 600),
        appeNotes: parsed.appeNotes?.trim() || "Check clarity and other viewpoints.",
      };
    }
    return {
      feedback: text.slice(0, 600) || "Try a clearer answer that names the moral stakes.",
      appeNotes: "Clarity and moral dimensions first.",
    };
  } catch {
    const words = args.answer.trim().split(/\s+/).filter(Boolean).length;
    return {
      feedback:
        words < 20
          ? "Too short for a judge. Name the answer, one reason, and one opposing view."
          : "Solid length. Next time open with the answer in one sentence, then one support.",
      appeNotes: "Presentation A (clarity) and B (moral dimensions).",
    };
  }
}
