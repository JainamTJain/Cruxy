import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { listOpenAttackClaimIds } from "@/lib/graph/arg-edges";
import {
  applyDailyCap,
  dailyFlashcardTarget,
  daysUntil,
  isCramMode,
} from "@/lib/revision/deck";
import {
  nextMastery,
  orderGraphDeckForPerson,
} from "@/lib/revision/graph-deck";
import type { CardFsrsState, Flashcard, NodeMastery } from "@/lib/revision/types";
import { listCompetitions } from "@/lib/db/repository";
import { iso, type Row } from "@/lib/db/supabase/util";
import { nowIso } from "@/lib/utils";

function must<T>(
  res: { data: T; error: { message: string } | null },
  ctx: string,
): T {
  assertOk(res.error, ctx);
  return res.data;
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
    last_review: r.last_review ? iso(r.last_review) : null,
    correct_streak: r.correct_streak ?? 0,
    pinned: Boolean(r.pinned),
    created_at: iso(r.created_at),
  };
}

function mapMastery(r: Row): NodeMastery {
  return {
    id: r.id,
    person_id: r.person_id,
    claim_id: r.claim_id,
    mastery: Number(r.mastery ?? 0.5),
    review_count: r.review_count ?? 0,
    last_grade: r.last_grade ?? null,
    updated_at: iso(r.updated_at),
    created_at: iso(r.created_at),
  };
}

export type GraphDueDeckResult = {
  cards: {
    card: Flashcard;
    state: CardFsrsState | null;
    underAttack?: boolean;
    mastery?: number | null;
  }[];
  dailyTarget: number;
  cramMode: boolean;
  daysToCompetition: number | null;
  leadCaseCount: number;
  totalInRotation: number;
  openAttackCount: number;
};

/** Best-effort link: match truth text / card back to a claim on the same team+case. */
export async function linkFlashcardsToClaims(filter?: {
  teamId?: string;
  caseId?: string;
}): Promise<number> {
  if (isSampleDataMode()) {
    let linked = 0;
    await updateStore((s) => {
      for (const card of s.flashcards) {
        if (card.claim_id) continue;
        if (filter?.teamId && card.team_id !== filter.teamId) continue;
        if (filter?.caseId && card.case_id !== filter.caseId) continue;
        const claim = s.claims.find(
          (c) =>
            c.team_id === card.team_id &&
            c.case_id === card.case_id &&
            (card.back.includes(c.text.slice(0, 40)) ||
              c.text.includes(card.back.slice(0, 40))),
        );
        if (claim) {
          (card as Flashcard).claim_id = claim.id;
          linked += 1;
        }
      }
    });
    return linked;
  }

  const sb = getServiceSupabase();
  let cq = sb.from("claims").select("id,team_id,case_id,text");
  if (filter?.teamId) cq = cq.eq("team_id", filter.teamId);
  if (filter?.caseId) cq = cq.eq("case_id", filter.caseId);
  const claims = must(await cq, "linkFlashcardsToClaims.claims") ?? [];

  let fq = sb
    .from("flashcards")
    .select("id,team_id,case_id,back,claim_id")
    .is("claim_id", null);
  if (filter?.teamId) fq = fq.eq("team_id", filter.teamId);
  if (filter?.caseId) fq = fq.eq("case_id", filter.caseId);
  const cards = must(await fq, "linkFlashcardsToClaims.cards") ?? [];

  let linked = 0;
  for (const card of cards) {
    const claim = claims.find(
      (c) =>
        c.team_id === card.team_id &&
        c.case_id === card.case_id &&
        (String(card.back).includes(String(c.text).slice(0, 40)) ||
          String(c.text).includes(String(card.back).slice(0, 40))),
    );
    if (!claim) continue;
    assertOk(
      (
        await sb
          .from("flashcards")
          .update({ claim_id: claim.id, updated_at: nowIso() })
          .eq("id", card.id)
      ).error,
      "linkFlashcardsToClaims.update",
    );
    linked += 1;
  }
  return linked;
}

export async function updateNodeMasteryAfterReview(args: {
  personId: string;
  cardId: string;
  grade: number;
}): Promise<NodeMastery | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const card = store.flashcards.find((c) => c.id === args.cardId);
    const claimId = card?.claim_id;
    if (!claimId) return null;
    let result: NodeMastery | null = null;
    await updateStore((s) => {
      const rows = (s as { node_mastery?: NodeMastery[] }).node_mastery ?? [];
      (s as { node_mastery: NodeMastery[] }).node_mastery = rows;
      const i = rows.findIndex(
        (m) => m.person_id === args.personId && m.claim_id === claimId,
      );
      const prior = i >= 0 ? rows[i]! : null;
      const mastery = nextMastery(prior?.mastery ?? 0.5, args.grade);
      const row: NodeMastery = {
        id: prior?.id ?? randomUUID(),
        person_id: args.personId,
        claim_id: claimId,
        mastery,
        review_count: (prior?.review_count ?? 0) + 1,
        last_grade: args.grade,
        updated_at: nowIso(),
        created_at: prior?.created_at ?? nowIso(),
      };
      if (i >= 0) rows[i] = row;
      else rows.push(row);
      result = row;
    });
    return result;
  }

  const sb = getServiceSupabase();
  const card = must(
    await sb
      .from("flashcards")
      .select("id,claim_id")
      .eq("id", args.cardId)
      .maybeSingle(),
    "updateNodeMastery.card",
  );
  if (!card?.claim_id) return null;

  const existing = must(
    await sb
      .from("node_mastery")
      .select("*")
      .eq("person_id", args.personId)
      .eq("claim_id", card.claim_id)
      .maybeSingle(),
    "updateNodeMastery.find",
  );

  const mastery = nextMastery(
    existing ? Number(existing.mastery) : 0.5,
    args.grade,
  );
  const row = {
    id: existing?.id ?? randomUUID(),
    person_id: args.personId,
    claim_id: card.claim_id as string,
    mastery,
    review_count: (existing?.review_count ?? 0) + 1,
    last_grade: args.grade,
    updated_at: nowIso(),
    created_at: existing?.created_at ?? nowIso(),
  };
  assertOk(
    (
      await sb.from("node_mastery").upsert(row, {
        onConflict: "person_id,claim_id",
      })
    ).error,
    "updateNodeMastery.upsert",
  );
  return mapMastery(row);
}

export async function dueGraphDeckForPerson(
  personId: string,
): Promise<GraphDueDeckResult> {
  await linkFlashcardsToClaims().catch(() => 0);

  if (isSampleDataMode()) {
    const {
      applyDailyCap: cap,
      dailyFlashcardTarget: targetFn,
      daysUntil: daysFn,
      isCramMode: cramFn,
    } = await import("@/lib/revision/deck");
    const { listCompetitions: comps } = await import("@/lib/db/repository");
    const store = await readStore();
    const optIns = store.deck_opt_ins.filter((d) => d.person_id === personId);
    const caseIds = new Set(optIns.map((d) => d.case_id));
    const leadCaseIds = new Set<string>();
    for (const role of store.case_roles.filter(
      (r) =>
        r.person_id === personId &&
        (r.role === "lead_1" || r.role === "lead_2"),
    )) {
      caseIds.add(role.case_id);
      leadCaseIds.add(role.case_id);
    }
    const competitions = await comps();
    const daysToCompetition = daysFn(competitions[0]?.date);
    const cramMode = cramFn(daysToCompetition);
    const dailyTarget = targetFn({
      daysToCompetition,
      leadCaseCount: leadCaseIds.size,
      cramMode,
    });
    const cards = store.flashcards.filter(
      (c) => c.case_id != null && caseIds.has(c.case_id),
    );
    const statesByCardId = new Map<string, CardFsrsState>();
    for (const s of store.card_fsrs_states) {
      if (s.person_id === personId) {
        statesByCardId.set(s.card_id, { ...s, pinned: s.pinned ?? false });
      }
    }
    const openAttackClaimIds = await listOpenAttackClaimIds([...caseIds]);
    const masteryByClaimId = new Map<string, number>();
    for (const m of (store as { node_mastery?: NodeMastery[] }).node_mastery ??
      []) {
      if (m.person_id === personId) masteryByClaimId.set(m.claim_id, m.mastery);
    }
    const ordered = orderGraphDeckForPerson({
      cards,
      statesByCardId,
      leadCaseIds,
      openAttackClaimIds,
      masteryByClaimId,
      cramMode,
    });
    const capped = cap(ordered, dailyTarget);
    return {
      cards: capped.map((item) => ({
        card: item.card,
        state: item.state,
        underAttack: Boolean(
          item.card.claim_id &&
            openAttackClaimIds.has(item.card.claim_id) &&
            item.card.case_id &&
            leadCaseIds.has(item.card.case_id),
        ),
        mastery: item.card.claim_id
          ? (masteryByClaimId.get(item.card.claim_id) ?? null)
          : null,
      })),
      dailyTarget,
      cramMode,
      daysToCompetition,
      leadCaseCount: leadCaseIds.size,
      totalInRotation: ordered.length,
      openAttackCount: openAttackClaimIds.size,
    };
  }

  const sb = getServiceSupabase();
  const [optIns, roles, competitions] = await Promise.all([
    sb.from("deck_opt_ins").select("case_id").eq("person_id", personId),
    sb
      .from("case_roles")
      .select("case_id")
      .eq("person_id", personId)
      .in("role", ["lead_1", "lead_2"]),
    listCompetitions(),
  ]);

  const caseIds = new Set<string>();
  const leadCaseIds = new Set<string>();
  for (const r of must(optIns, "dueGraph.optIns") ?? []) caseIds.add(r.case_id);
  for (const r of must(roles, "dueGraph.roles") ?? []) {
    caseIds.add(r.case_id);
    leadCaseIds.add(r.case_id);
  }

  const daysToCompetition = daysUntil(competitions[0]?.date);
  const cramMode = isCramMode(daysToCompetition);
  const dailyTarget = dailyFlashcardTarget({
    daysToCompetition,
    leadCaseCount: leadCaseIds.size,
    cramMode,
  });

  if (caseIds.size === 0) {
    return {
      cards: [],
      dailyTarget,
      cramMode,
      daysToCompetition,
      leadCaseCount: 0,
      totalInRotation: 0,
      openAttackCount: 0,
    };
  }

  const cardRows =
    must(
      await sb
        .from("flashcards")
        .select("*")
        .in("case_id", [...caseIds])
        .order("created_at", { ascending: true }),
      "dueGraph.cards",
    ) ?? [];
  const cards = cardRows.map(mapFlashcard);
  const stateRows =
    cards.length === 0
      ? []
      : (must(
          await sb
            .from("card_fsrs_states")
            .select("*")
            .eq("person_id", personId)
            .in(
              "card_id",
              cards.map((c) => c.id),
            ),
          "dueGraph.states",
        ) ?? []);
  const statesByCardId = new Map<string, CardFsrsState>(
    stateRows.map((r: Row) => [r.card_id, mapFsrs(r)]),
  );

  const claimIds = [
    ...new Set(cards.map((c) => c.claim_id).filter(Boolean) as string[]),
  ];
  const masteryRows =
    claimIds.length === 0
      ? []
      : (must(
          await sb
            .from("node_mastery")
            .select("*")
            .eq("person_id", personId)
            .in("claim_id", claimIds),
          "dueGraph.mastery",
        ) ?? []);
  const masteryByClaimId = new Map<string, number>(
    masteryRows.map((r: Row) => [r.claim_id, Number(r.mastery)]),
  );

  const openAttackClaimIds = await listOpenAttackClaimIds([...caseIds]);

  const ordered = orderGraphDeckForPerson({
    cards,
    statesByCardId,
    leadCaseIds,
    openAttackClaimIds,
    masteryByClaimId,
    cramMode,
  });
  const capped = applyDailyCap(ordered, dailyTarget);

  return {
    cards: capped.map((item) => ({
      card: item.card,
      state: item.state,
      underAttack: Boolean(
        item.card.claim_id &&
          openAttackClaimIds.has(item.card.claim_id) &&
          item.card.case_id &&
          leadCaseIds.has(item.card.case_id),
      ),
      mastery: item.card.claim_id
        ? (masteryByClaimId.get(item.card.claim_id) ?? null)
        : null,
    })),
    dailyTarget,
    cramMode,
    daysToCompetition,
    leadCaseCount: leadCaseIds.size,
    totalInRotation: ordered.length,
    openAttackCount: openAttackClaimIds.size,
  };
}
