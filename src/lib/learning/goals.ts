import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { logActivity } from "@/lib/db/repository";
import type {
  GoalStatus,
  PersonalGoal,
  PersonalGoalComment,
} from "@/lib/learning/growth-types";
import type { AppeItemKey } from "@/lib/practice/types";
import { APPE_SCORE_ITEMS } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

type Bag = {
  personal_goals?: PersonalGoal[];
  personal_goal_comments?: PersonalGoalComment[];
};

const MAX_OPEN_GOALS = 3;

function mapGoal(row: Record<string, unknown>): PersonalGoal {
  const item = row.target_appe_item
    ? String(row.target_appe_item)
    : null;
  const okItem =
    item && APPE_SCORE_ITEMS.some((i) => i.key === item)
      ? (item as AppeItemKey)
      : null;
  const status = String(row.status ?? "open") as GoalStatus;
  return {
    id: String(row.id),
    person_id: String(row.person_id),
    title: String(row.title ?? ""),
    body: (row.body as string | null) ?? null,
    status: ["open", "done", "dropped"].includes(status) ? status : "open",
    target_appe_item: okItem,
    created_at: String(row.created_at ?? nowIso()),
    updated_at: String(row.updated_at ?? nowIso()),
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapComment(row: Record<string, unknown>): PersonalGoalComment {
  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    author_id: String(row.author_id),
    body: String(row.body ?? ""),
    created_at: String(row.created_at ?? nowIso()),
  };
}

export async function listGoalsForPerson(
  personId: string,
): Promise<PersonalGoal[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as Bag;
    return (bag.personal_goals ?? [])
      .filter((g) => g.person_id === personId)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("personal_goals")
    .select("*")
    .eq("person_id", personId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listGoalsForPerson: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapGoal);
}

export async function listCommentsForGoals(
  goalIds: string[],
): Promise<PersonalGoalComment[]> {
  if (!goalIds.length) return [];
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as Bag;
    const set = new Set(goalIds);
    return (bag.personal_goal_comments ?? [])
      .filter((c) => set.has(c.goal_id))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("personal_goal_comments")
    .select("*")
    .in("goal_id", goalIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listCommentsForGoals: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapComment);
}

export async function createGoal(input: {
  personId: string;
  title: string;
  body?: string | null;
  targetAppeItem?: AppeItemKey | null;
}): Promise<PersonalGoal> {
  const title = input.title.trim().slice(0, 120);
  if (title.length < 3) throw new Error("Write a short goal title.");
  const existing = await listGoalsForPerson(input.personId);
  const open = existing.filter((g) => g.status === "open");
  if (open.length >= MAX_OPEN_GOALS) {
    throw new Error(`You can have up to ${MAX_OPEN_GOALS} open goals.`);
  }
  const at = nowIso();
  const row: PersonalGoal = {
    id: randomUUID(),
    person_id: input.personId,
    title,
    body: input.body?.trim().slice(0, 500) || null,
    status: "open",
    target_appe_item: input.targetAppeItem ?? null,
    created_at: at,
    updated_at: at,
    created_by: input.personId,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as Bag;
      if (!bag.personal_goals) bag.personal_goals = [];
      bag.personal_goals.push(row);
    });
  } else {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("personal_goals")
      .insert({
        id: row.id,
        person_id: row.person_id,
        title: row.title,
        body: row.body,
        status: row.status,
        target_appe_item: row.target_appe_item,
        created_by: row.created_by,
      })
      .select("*")
      .single();
    if (error) throw new Error(`createGoal: ${error.message}`);
    Object.assign(row, mapGoal(data as Record<string, unknown>));
  }

  await logActivity({
    person_id: input.personId,
    action: "goal_created",
    target: row.id,
    meta: null,
  });
  return row;
}

export async function updateGoal(input: {
  personId: string;
  goalId: string;
  title?: string;
  body?: string | null;
  status?: GoalStatus;
  targetAppeItem?: AppeItemKey | null;
}): Promise<PersonalGoal> {
  const goals = await listGoalsForPerson(input.personId);
  const prev = goals.find((g) => g.id === input.goalId);
  if (!prev) throw new Error("Goal not found.");
  const at = nowIso();
  const next: PersonalGoal = {
    ...prev,
    title: input.title != null ? input.title.trim().slice(0, 120) : prev.title,
    body:
      input.body !== undefined
        ? input.body?.trim().slice(0, 500) || null
        : prev.body,
    status: input.status ?? prev.status,
    target_appe_item:
      input.targetAppeItem !== undefined
        ? input.targetAppeItem
        : prev.target_appe_item,
    updated_at: at,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as Bag;
      const i = (bag.personal_goals ?? []).findIndex((g) => g.id === next.id);
      if (i >= 0) bag.personal_goals![i] = next;
    });
  } else {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("personal_goals")
      .update({
        title: next.title,
        body: next.body,
        status: next.status,
        target_appe_item: next.target_appe_item,
        updated_at: at,
      })
      .eq("id", next.id)
      .eq("person_id", input.personId)
      .select("*")
      .single();
    if (error) throw new Error(`updateGoal: ${error.message}`);
    Object.assign(next, mapGoal(data as Record<string, unknown>));
  }

  await logActivity({
    person_id: input.personId,
    action: "goal_updated",
    target: next.id,
    meta: { status: next.status },
  });
  return next;
}

export async function addGoalComment(input: {
  goalId: string;
  authorId: string;
  body: string;
}): Promise<PersonalGoalComment> {
  const body = input.body.trim().slice(0, 600);
  if (body.length < 2) throw new Error("Write a short comment.");
  const at = nowIso();
  const row: PersonalGoalComment = {
    id: randomUUID(),
    goal_id: input.goalId,
    author_id: input.authorId,
    body,
    created_at: at,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as Bag;
      if (!bag.personal_goal_comments) bag.personal_goal_comments = [];
      bag.personal_goal_comments.push(row);
    });
  } else {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("personal_goal_comments")
      .insert({
        id: row.id,
        goal_id: row.goal_id,
        author_id: row.author_id,
        body: row.body,
      })
      .select("*")
      .single();
    if (error) throw new Error(`addGoalComment: ${error.message}`);
    Object.assign(row, mapComment(data as Record<string, unknown>));
  }

  await logActivity({
    person_id: input.authorId,
    action: "goal_comment",
    target: input.goalId,
    meta: null,
  });
  return row;
}

export async function getGoalById(
  goalId: string,
): Promise<PersonalGoal | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as Bag;
    return (bag.personal_goals ?? []).find((g) => g.id === goalId) ?? null;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("personal_goals")
    .select("*")
    .eq("id", goalId)
    .maybeSingle();
  if (error) throw new Error(`getGoalById: ${error.message}`);
  return data ? mapGoal(data as Record<string, unknown>) : null;
}
