/**
 * Workstream G: admin-only data helpers.
 * Does not edit existing repository or supabase modules (Wave 2 rule).
 * Dispatches sample vs live via isSampleDataMode().
 */
import "server-only";
import { randomUUID } from "crypto";
import { COACH_PERSON_ID } from "@/lib/constants";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase, assertOk } from "@/lib/db/supabase/client";
import {
  getSharedStarter,
  getPersonStarter,
  listPeopleFull,
  listTeams,
  logActivity,
  upsertAuthCode,
} from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";
import { missingStarterHash } from "@/lib/db/supabase/foundation";
import type { AuthCode } from "@/lib/types";

export type TeamReadiness = {
  team_id: string;
  avg: number;
  delta_week: number;
};

/** Readiness from readiness_cells when present; else from truth_items density. */
export async function adminTeamReadiness(): Promise<TeamReadiness[]> {
  const teams = await listTeams();
  if (isSampleDataMode()) {
    const store = await readStore();
    const byTeam = new Map<string, number[]>();
    for (const cell of store.readiness) {
      const arr = byTeam.get(cell.team_id) ?? [];
      arr.push(cell.readiness_pct);
      byTeam.set(cell.team_id, arr);
    }
    if (byTeam.size > 0) {
      const deltas: Record<string, number> = {};
      if (teams[0]) deltas[teams[0].id] = 9;
      if (teams[1]) deltas[teams[1].id] = 6;
      if (teams[2]) deltas[teams[2].id] = 11;
      return teams.map((t) => {
        const vals = byTeam.get(t.id) ?? [];
        return {
          team_id: t.id,
          avg: vals.length
            ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
            : 0,
          delta_week: deltas[t.id] ?? 0,
        };
      });
    }
    // Derive from seeded truth items (Team 3 heavy; others thinner).
    const counts = new Map<string, number>();
    for (const item of store.truth_items) {
      if (item.status !== "accepted") continue;
      counts.set(item.team_id, (counts.get(item.team_id) ?? 0) + 1);
    }
    const max = Math.max(1, ...[...counts.values()], 1);
    return teams.map((t, i) => {
      const n = counts.get(t.id) ?? 0;
      const avg = Math.min(100, Math.round((n / max) * 100));
      // Only show a week delta when the team has real content.
      const delta_week = n > 0 ? ([9, 6, 11][i] ?? 0) : 0;
      return { team_id: t.id, avg, delta_week };
    });
  }

  const sb = getServiceSupabase();
  const { data: cells, error } = await sb
    .from("readiness_cells")
    .select("team_id, readiness_pct");
  assertOk(error, "adminTeamReadiness.cells");
  const byTeam = new Map<string, number[]>();
  for (const row of cells ?? []) {
    const tid = String((row as { team_id: string }).team_id);
    const pct = Number((row as { readiness_pct: number }).readiness_pct);
    const arr = byTeam.get(tid) ?? [];
    arr.push(pct);
    byTeam.set(tid, arr);
  }
  if (byTeam.size > 0) {
    return teams.map((t) => {
      const vals = byTeam.get(t.id) ?? [];
      return {
        team_id: t.id,
        avg: vals.length
          ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
          : 0,
        delta_week: 0,
      };
    });
  }

  const { data: items, error: tErr } = await sb
    .from("truth_items")
    .select("team_id")
    .eq("status", "accepted");
  assertOk(tErr, "adminTeamReadiness.truth");
  const counts = new Map<string, number>();
  for (const row of items ?? []) {
    const tid = String((row as { team_id: string }).team_id);
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  const max = Math.max(1, ...[...counts.values()], 1);
  return teams.map((t) => {
    const n = counts.get(t.id) ?? 0;
    return {
      team_id: t.id,
      avg: Math.min(100, Math.round((n / max) * 100)),
      delta_week: 0,
    };
  });
}

/** Attendance % from recent attendance rows, or sign-in coverage as fallback. */
export async function adminAttendancePct(): Promise<number> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const recent = store.attendance.slice(-200);
    if (recent.length > 0) {
      const present = recent.filter(
        (a) => a.status === "present" || a.status === "late",
      ).length;
      return Math.round((present / recent.length) * 100);
    }
    const members = store.people.filter(
      (p) => p.role === "member" || p.role === "tech_admin",
    );
    if (!members.length) return 0;
    const signed = members.filter((p) => p.last_sign_in_at).length;
    return Math.round((signed / members.length) * 100);
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("attendance")
    .select("status")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!error && data && data.length > 0) {
    const present = data.filter((a) => {
      const s = String((a as { status: string }).status);
      return s === "present" || s === "late";
    }).length;
    return Math.round((present / data.length) * 100);
  }

  const people = await listPeopleFull();
  const members = people.filter(
    (p) => p.role === "member" || p.role === "tech_admin",
  );
  if (!members.length) return 0;
  const signed = members.filter((p) => p.last_sign_in_at).length;
  return Math.round((signed / members.length) * 100);
}

export type StarterStatus = {
  memberSet: boolean;
  coachSet: boolean;
  /** Env hash missing in live mode — show a clear admin message. */
  memberEnvMissing: boolean;
  memberSetAt: string | null;
  coachSetAt: string | null;
};

export async function adminStarterStatus(): Promise<StarterStatus> {
  const member = await getSharedStarter();
  const coach = await getPersonStarter(COACH_PERSON_ID);
  return {
    memberSet: Boolean(member?.hash),
    coachSet: Boolean(coach?.hash),
    memberEnvMissing: !isSampleDataMode() && missingStarterHash() && !member?.hash,
    memberSetAt: member?.set_at ?? null,
    coachSetAt: coach?.set_at ?? null,
  };
}

/** Rotate Dr. B's person-scoped coach starter (hash only; never returned). */
export async function updateCoachStarterHash(
  hash: string,
  actorId: string,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const row = s.auth_codes.find(
        (c) => c.kind === "starter" && c.person_id === COACH_PERSON_ID,
      );
      if (row) {
        row.hash = hash;
        row.set_at = nowIso();
      } else {
        s.auth_codes.push({
          id: randomUUID(),
          kind: "starter",
          person_id: COACH_PERSON_ID,
          hash,
          encrypted_copy: null,
          must_choose: false,
          set_at: nowIso(),
          last_revealed_at: null,
          created_at: nowIso(),
        });
      }
    });
  } else {
    const existing = await getPersonStarter(COACH_PERSON_ID);
    const row: AuthCode = existing
      ? { ...existing, hash, set_at: nowIso() }
      : {
          id: randomUUID(),
          kind: "starter",
          person_id: COACH_PERSON_ID,
          hash,
          encrypted_copy: null,
          must_choose: false,
          set_at: nowIso(),
          last_revealed_at: null,
          created_at: nowIso(),
        };
    await upsertAuthCode(row);
  }
  await logActivity({
    person_id: actorId,
    action: "coach_starter_rotated",
    target: COACH_PERSON_ID,
  });
}

export async function rotateMemberStarterHash(
  hash: string,
  actorId: string,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const starter = s.auth_codes.find(
        (c) => c.kind === "starter" && !c.person_id,
      );
      if (starter) {
        starter.hash = hash;
        starter.set_at = nowIso();
      }
    });
  } else {
    const { updateSharedStarterHash } = await import(
      "@/lib/db/supabase/foundation"
    );
    await updateSharedStarterHash(hash);
  }
  await logActivity({
    person_id: actorId,
    action: "member_starter_rotated",
    target: "shared_starter",
  });
}

/** Group spend rows into the Admin.html feature buckets. */
export function groupSpendFeatures(
  byFeature: { feature: string; cost_usd: number; calls?: number }[],
): { label: string; cost_usd: number; note?: string }[] {
  const buckets: Record<string, number> = {
    Transcription: 0,
    "Judging and reports": 0,
    Research: 0,
    "Assistant and drills": 0,
  };
  for (const row of byFeature) {
    const f = row.feature.toLowerCase();
    let key = "Assistant and drills";
    if (f.includes("transcri") || f.includes("assembly")) key = "Transcription";
    else if (
      f.includes("judge") ||
      f.includes("report") ||
      f.includes("feedback") ||
      f.includes("calib")
    ) {
      key = "Judging and reports";
    } else if (f.includes("research") || f.includes("librarian") || f.includes("digest")) {
      key = "Research";
    }
    buckets[key] = (buckets[key] ?? 0) + row.cost_usd;
  }
  return [
    {
      label: "Transcription",
      cost_usd: buckets.Transcription,
      note: buckets.Transcription === 0 ? "free credit" : undefined,
    },
    {
      label: "Judging and reports",
      cost_usd: buckets["Judging and reports"],
    },
    { label: "Research", cost_usd: buckets.Research },
    {
      label: "Assistant and drills",
      cost_usd: buckets["Assistant and drills"],
    },
  ];
}
