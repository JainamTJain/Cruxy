import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { getLearningProfile } from "@/lib/learning/profile";
import { listGoalsForPerson, listCommentsForGoals } from "@/lib/learning/goals";
import { listReflectionsForPerson } from "@/lib/learning/reflections";
import type {
  PersonalGoal,
  PersonalGoalComment,
  ProgressItemSeries,
  ProgressPoint,
  RoundReflection,
} from "@/lib/learning/growth-types";
import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";
import { listPeopleFull } from "@/lib/db/repository";

export type KudoNote = {
  id: string;
  from_name: string;
  body: string;
  created_at: string;
};

export type MyProgressView = {
  baselines: Partial<Record<AppeItemKey, number>>;
  series: ProgressItemSeries[];
  points: ProgressPoint[];
  movedMost: {
    key: AppeItemKey;
    label: string;
    delta: number;
    baseline: number;
    latest: number;
  } | null;
  reflections: RoundReflection[];
  goals: (PersonalGoal & { comments: PersonalGoalComment[] })[];
  kudos: KudoNote[];
};

async function softListKudos(personId: string): Promise<KudoNote[]> {
  try {
    if (isSampleDataMode()) {
      const store = await readStore();
      const bag = store as unknown as {
        kudos?: {
          id: string;
          to_person_id: string;
          from_person_id: string;
          body: string;
          created_at: string;
        }[];
      };
      const rows = (bag.kudos ?? []).filter((k) => k.to_person_id === personId);
      if (!rows.length) return [];
      const people = await listPeopleFull();
      return rows
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 12)
        .map((k) => ({
          id: k.id,
          from_name:
            people.find((p) => p.id === k.from_person_id)?.name ?? "Teammate",
          body: k.body,
          created_at: k.created_at,
        }));
    }
    const sb = getServiceSupabase();
    // Soft-read E's table when present; ignore if missing.
    const { data, error } = await sb
      .from("kudos")
      .select("id, from_person_id, body, created_at")
      .eq("to_person_id", personId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) return [];
    const people = await listPeopleFull();
    return (data ?? []).map((k) => ({
      id: String(k.id),
      from_name:
        people.find((p) => p.id === k.from_person_id)?.name ?? "Teammate",
      body: String(k.body ?? ""),
      created_at: String(k.created_at),
    }));
  } catch {
    return [];
  }
}

/**
 * Build personal APPE progress: baselines then per-round team means
 * for rounds this person was on. Never compares people.
 */
export async function getMyProgressView(
  personId: string,
): Promise<MyProgressView> {
  const profile = await getLearningProfile(personId);
  const baselines = profile?.appe_baselines ?? {};
  const people = await listPeopleFull();
  const me = people.find((p) => p.id === personId);
  const teamId = me?.team_id ?? null;

  const points: ProgressPoint[] = [];

  if (isSampleDataMode()) {
    const store = await readStore();
    // Rounds where this person has feedback, attendance, or skill chart.
    const roundIds = new Set<string>();
    for (const f of store.feedback_items ?? []) {
      if (f.person_id === personId) roundIds.add(f.round_id);
    }
    for (const a of store.attendance ?? []) {
      if (a.person_id === personId) {
        const sess = store.practice_sessions.find((s) => s.id === a.session_id);
        if (sess) {
          for (const r of store.practice_rounds) {
            if (r.session_id === sess.id) roundIds.add(r.id);
          }
        }
      }
    }

    const rounds = store.practice_rounds
      .filter((r) => roundIds.has(r.id) && r.ended_at)
      .sort((a, b) =>
        (a.ended_at ?? a.created_at) < (b.ended_at ?? b.created_at) ? -1 : 1,
      );

    for (const round of rounds) {
      const team =
        teamId &&
        (round.sides.presenting === teamId ||
          round.sides.commenting === teamId ||
          round.team_ids.includes(teamId))
          ? teamId
          : (round.sides.presenting ?? round.team_ids[0] ?? null);
      if (!team) continue;
      const cards = store.judge_cards.filter(
        (c) => c.round_id === round.id && c.team_id === team,
      );
      if (!cards.length) continue;
      const items: Partial<Record<AppeItemKey, number>> = {};
      let sum = 0;
      let n = 0;
      for (const item of APPE_SCORE_ITEMS) {
        const scores = store.card_scores.filter(
          (s) =>
            s.item === item.key && cards.some((c) => c.id === s.card_id),
        );
        if (!scores.length) continue;
        const avg =
          scores.reduce((acc, s) => acc + s.score, 0) / scores.length;
        items[item.key] = Math.round(avg * 10) / 10;
        sum += avg;
        n += 1;
      }
      if (!n) continue;
      points.push({
        round_id: round.id,
        case_number: round.case_number,
        at: round.ended_at ?? round.created_at,
        items,
        mean: Math.round((sum / n) * 10) / 10,
      });
    }
  } else {
    const sb = getServiceSupabase();
    // Feedback-linked rounds for this person.
    const { data: fb } = await sb
      .from("feedback_items")
      .select("round_id")
      .eq("person_id", personId)
      .limit(80);
    const roundIds = [
      ...new Set((fb ?? []).map((r) => String(r.round_id)).filter(Boolean)),
    ];
    if (roundIds.length && teamId) {
      const { data: rounds } = await sb
        .from("rounds")
        .select("id, case_number, ended_at, created_at, sides, team_ids")
        .in("id", roundIds)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: true });
      for (const round of rounds ?? []) {
        const sides = (round.sides ?? {}) as {
          presenting?: string | null;
          commenting?: string | null;
        };
        const teamIds = (round.team_ids as string[]) ?? [];
        const onTeam =
          sides.presenting === teamId ||
          sides.commenting === teamId ||
          teamIds.includes(teamId);
        if (!onTeam) continue;
        const { data: cards } = await sb
          .from("judge_cards")
          .select("id")
          .eq("round_id", round.id)
          .eq("team_id", teamId);
        const cardIds = (cards ?? []).map((c) => c.id as string);
        if (!cardIds.length) continue;
        const { data: scores } = await sb
          .from("card_scores")
          .select("item, score, card_id")
          .in("card_id", cardIds);
        const byItem = new Map<string, number[]>();
        for (const s of scores ?? []) {
          const arr = byItem.get(String(s.item)) ?? [];
          arr.push(Number(s.score));
          byItem.set(String(s.item), arr);
        }
        const items: Partial<Record<AppeItemKey, number>> = {};
        let sum = 0;
        let n = 0;
        for (const item of APPE_SCORE_ITEMS) {
          const arr = byItem.get(item.key);
          if (!arr?.length) continue;
          const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
          items[item.key] = Math.round(avg * 10) / 10;
          sum += avg;
          n += 1;
        }
        if (!n) continue;
        points.push({
          round_id: String(round.id),
          case_number:
            round.case_number == null ? null : Number(round.case_number),
          at: String(round.ended_at ?? round.created_at),
          items,
          mean: Math.round((sum / n) * 10) / 10,
        });
      }
    }
  }

  const series: ProgressItemSeries[] = APPE_SCORE_ITEMS.map((item) => {
    const baseline =
      typeof baselines[item.key] === "number" ? baselines[item.key]! : null;
    const itemPoints = points
      .filter((p) => typeof p.items[item.key] === "number")
      .map((p) => ({
        at: p.at,
        score: p.items[item.key]!,
        case_number: p.case_number,
      }));
    const latest = itemPoints.length
      ? itemPoints[itemPoints.length - 1]!.score
      : null;
    const delta =
      baseline != null && latest != null
        ? Math.round((latest - baseline) * 10) / 10
        : null;
    return {
      key: item.key,
      label: item.label,
      baseline,
      latest,
      delta,
      points: itemPoints,
    };
  });

  let movedMost: MyProgressView["movedMost"] = null;
  for (const s of series) {
    if (s.delta == null || s.baseline == null || s.latest == null) continue;
    if (!movedMost || Math.abs(s.delta) > Math.abs(movedMost.delta)) {
      movedMost = {
        key: s.key,
        label: s.label,
        delta: s.delta,
        baseline: s.baseline,
        latest: s.latest,
      };
    }
  }

  const reflections = await listReflectionsForPerson(personId, 12);
  const goals = await listGoalsForPerson(personId);
  const comments = await listCommentsForGoals(goals.map((g) => g.id));
  const goalsWithComments = goals.map((g) => ({
    ...g,
    comments: comments.filter((c) => c.goal_id === g.id),
  }));
  const kudos = await softListKudos(personId);

  return {
    baselines,
    series,
    points,
    movedMost,
    reflections,
    goals: goalsWithComments,
    kudos,
  };
}
