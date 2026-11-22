import type { AppeItemKey } from "@/lib/practice/types";

export type GoalStatus = "open" | "done" | "dropped";

export interface RoundReflection {
  id: string;
  person_id: string;
  round_id: string;
  case_id: string | null;
  went_well: string;
  one_change: string;
  /** 0 to 100 how sure they felt. */
  confidence: number;
  seconds_spent: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalGoal {
  id: string;
  person_id: string;
  title: string;
  body: string | null;
  status: GoalStatus;
  target_appe_item: AppeItemKey | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface PersonalGoalComment {
  id: string;
  goal_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export type ProgressPoint = {
  round_id: string;
  case_number: number | null;
  at: string;
  items: Partial<Record<AppeItemKey, number>>;
  mean: number | null;
};

export type ProgressItemSeries = {
  key: AppeItemKey;
  label: string;
  baseline: number | null;
  latest: number | null;
  delta: number | null;
  points: { at: string; score: number; case_number: number | null }[];
};
