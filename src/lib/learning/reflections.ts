import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { logActivity } from "@/lib/db/repository";
import type { RoundReflection } from "@/lib/learning/growth-types";
import { nowIso } from "@/lib/utils";

type Bag = { round_reflections?: RoundReflection[] };

function mapRow(row: Record<string, unknown>): RoundReflection {
  return {
    id: String(row.id),
    person_id: String(row.person_id),
    round_id: String(row.round_id),
    case_id: (row.case_id as string | null) ?? null,
    went_well: String(row.went_well ?? ""),
    one_change: String(row.one_change ?? ""),
    confidence: Math.min(100, Math.max(0, Number(row.confidence) || 50)),
    seconds_spent:
      row.seconds_spent == null ? null : Number(row.seconds_spent),
    created_at: String(row.created_at ?? nowIso()),
    updated_at: String(row.updated_at ?? nowIso()),
  };
}

export async function getReflectionForRound(
  personId: string,
  roundId: string,
): Promise<RoundReflection | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as Bag;
    return (
      (bag.round_reflections ?? []).find(
        (r) => r.person_id === personId && r.round_id === roundId,
      ) ?? null
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("round_reflections")
    .select("*")
    .eq("person_id", personId)
    .eq("round_id", roundId)
    .maybeSingle();
  if (error) throw new Error(`getReflectionForRound: ${error.message}`);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** Most recent reflection for this person on this case (any round). */
export async function getLatestReflectionForCase(
  personId: string,
  caseId: string,
): Promise<RoundReflection | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as Bag;
    const rows = (bag.round_reflections ?? [])
      .filter((r) => r.person_id === personId && r.case_id === caseId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return rows[0] ?? null;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("round_reflections")
    .select("*")
    .eq("person_id", personId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestReflectionForCase: ${error.message}`);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function listReflectionsForPerson(
  personId: string,
  limit = 20,
): Promise<RoundReflection[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as Bag;
    return (bag.round_reflections ?? [])
      .filter((r) => r.person_id === personId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, limit);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("round_reflections")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listReflectionsForPerson: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

export async function upsertReflection(input: {
  personId: string;
  roundId: string;
  caseId: string | null;
  wentWell: string;
  oneChange: string;
  confidence: number;
  secondsSpent?: number | null;
}): Promise<RoundReflection> {
  const at = nowIso();
  const went_well = input.wentWell.trim().slice(0, 400);
  const one_change = input.oneChange.trim().slice(0, 400);
  if (went_well.length < 3 && one_change.length < 3) {
    throw new Error("Write at least one short note.");
  }
  const confidence = Math.min(
    100,
    Math.max(0, Math.round(input.confidence)),
  );

  if (isSampleDataMode()) {
    let row: RoundReflection = {
      id: randomUUID(),
      person_id: input.personId,
      round_id: input.roundId,
      case_id: input.caseId,
      went_well,
      one_change,
      confidence,
      seconds_spent: input.secondsSpent ?? null,
      created_at: at,
      updated_at: at,
    };
    await updateStore((s) => {
      const bag = s as unknown as Bag;
      if (!bag.round_reflections) bag.round_reflections = [];
      const i = bag.round_reflections.findIndex(
        (r) =>
          r.person_id === input.personId && r.round_id === input.roundId,
      );
      if (i >= 0) {
        const prev = bag.round_reflections[i]!;
        row = {
          ...row,
          id: prev.id,
          created_at: prev.created_at,
          updated_at: at,
        };
        bag.round_reflections[i] = row;
      } else {
        bag.round_reflections.push(row);
      }
    });
    await logActivity({
      person_id: input.personId,
      action: "reflection_saved",
      target: input.roundId,
      meta: null,
    });
    return row;
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("round_reflections")
    .upsert(
      {
        person_id: input.personId,
        round_id: input.roundId,
        case_id: input.caseId,
        went_well,
        one_change,
        confidence,
        seconds_spent: input.secondsSpent ?? null,
        updated_at: at,
      },
      { onConflict: "person_id,round_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertReflection: ${error.message}`);
  await logActivity({
    person_id: input.personId,
    action: "reflection_saved",
    target: input.roundId,
    meta: null,
  });
  return mapRow(data as Record<string, unknown>);
}

export async function deleteReflectionsForPerson(
  personId: string,
): Promise<number> {
  if (isSampleDataMode()) {
    let n = 0;
    await updateStore((s) => {
      const bag = s as unknown as Bag;
      const before = bag.round_reflections?.length ?? 0;
      bag.round_reflections = (bag.round_reflections ?? []).filter(
        (r) => r.person_id !== personId,
      );
      n = before - (bag.round_reflections?.length ?? 0);
    });
    await logActivity({
      person_id: personId,
      action: "reflection_deleted",
      target: personId,
      meta: { count: n },
    });
    return n;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("round_reflections")
    .delete()
    .eq("person_id", personId)
    .select("id");
  if (error) throw new Error(`deleteReflectionsForPerson: ${error.message}`);
  const n = data?.length ?? 0;
  await logActivity({
    person_id: personId,
    action: "reflection_deleted",
    target: personId,
    meta: { count: n },
  });
  return n;
}
