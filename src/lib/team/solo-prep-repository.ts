/**
 * Wave 9 E: solo async prep data access.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { getPersonById, logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import {
  PART_MINUTES_BY_ROLE,
  SOLO_PART_LABELS,
  partsForRole,
  type SoloPartId,
  type SoloPartRow,
} from "@/lib/team/solo-prep";
import { listCaseRoles } from "@/lib/team/repository";
import {
  CASE_ROLE_SLOTS,
  type CaseRoleSlot,
} from "@/lib/team/types";
import { nowIso } from "@/lib/utils";

type ProgressRow = {
  person_id: string;
  team_id: string;
  case_id: string;
  part: SoloPartId;
  done_at: string | null;
  minutes_spent: number;
  updated_at: string;
};

type SoloRecording = {
  id: string;
  person_id: string;
  team_id: string;
  case_id: string;
  part: SoloPartId;
  title: string;
  storage_path: string | null;
  duration_ms: number | null;
  created_at: string;
};

type SoloComment = {
  id: string;
  recording_id: string;
  author_id: string;
  body: string;
  at_ms: number;
  created_at: string;
};

type SoloHandoff = {
  id: string;
  person_id: string;
  team_id: string;
  case_id: string;
  body: string;
  created_at: string;
};

type StoreBag = {
  solo_part_progress?: ProgressRow[];
  solo_recordings?: SoloRecording[];
  solo_review_comments?: SoloComment[];
  solo_handoffs?: SoloHandoff[];
  solo_case_visits?: {
    person_id: string;
    case_id: string;
    last_seen_at: string;
  }[];
};

async function listProgress(personId: string): Promise<ProgressRow[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return ((store as StoreBag).solo_part_progress ?? []).filter(
      (p) => p.person_id === personId,
    );
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("solo_part_progress")
    .select("*")
    .eq("person_id", personId);
  return (data as ProgressRow[]) ?? [];
}

export async function getMyParts(input: {
  personId: string;
  teamId: string;
}): Promise<SoloPartRow[]> {
  const roles = await listCaseRoles(input.teamId);
  const mine = roles.filter((r) => r.person_id === input.personId);
  const progress = await listProgress(input.personId);
  const progressKey = (caseId: string, part: SoloPartId) =>
    `${caseId}:${part}`;
  const doneMap = new Map(
    progress.map((p) => [progressKey(p.case_id, p.part), p]),
  );

  let cases: { id: string; number: number; title: string }[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    cases = store.cases.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
    }));
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data } = await getServiceSupabase()
      .from("cases")
      .select("id,number,title")
      .order("number");
    cases = (data ?? []).map((c) => ({
      id: c.id as string,
      number: c.number as number,
      title: c.title as string,
    }));
  }
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const rows: SoloPartRow[] = [];
  for (const r of mine) {
    if (!CASE_ROLE_SLOTS.includes(r.role as CaseRoleSlot)) continue;
    const role = r.role as CaseRoleSlot;
    const c = caseById.get(r.case_id);
    if (!c) continue;
    for (const part of partsForRole(role)) {
      const prev = doneMap.get(progressKey(r.case_id, part));
      rows.push({
        caseId: c.id,
        caseNumber: c.number,
        caseTitle: c.title,
        role,
        part,
        label: SOLO_PART_LABELS[part],
        minutes: PART_MINUTES_BY_ROLE[role][part],
        done: Boolean(prev?.done_at),
        doneAt: prev?.done_at ?? null,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.caseNumber - b.caseNumber ||
      a.part.localeCompare(b.part),
  );
}

export async function setPartDone(input: {
  personId: string;
  teamId: string;
  caseId: string;
  part: SoloPartId;
  done: boolean;
  minutesSpent?: number;
}): Promise<void> {
  const stamp = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((s as StoreBag).solo_part_progress ??= []);
      const i = bag.findIndex(
        (p) =>
          p.person_id === input.personId &&
          p.case_id === input.caseId &&
          p.part === input.part,
      );
      const row: ProgressRow = {
        person_id: input.personId,
        team_id: input.teamId,
        case_id: input.caseId,
        part: input.part,
        done_at: input.done ? stamp : null,
        minutes_spent: input.minutesSpent ?? (i >= 0 ? bag[i]!.minutes_spent : 0),
        updated_at: stamp,
      };
      if (i >= 0) bag[i] = row;
      else bag.push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    await getServiceSupabase().from("solo_part_progress").upsert(
      {
        person_id: input.personId,
        team_id: input.teamId,
        case_id: input.caseId,
        part: input.part,
        done_at: input.done ? stamp : null,
        minutes_spent: input.minutesSpent ?? 0,
        updated_at: stamp,
      },
      { onConflict: "person_id,case_id,part" },
    );
  }
  await logActivity({
    person_id: input.personId,
    action: input.done ? "solo_part_done" : "solo_part_reopened",
    target: input.caseId,
    meta: { part: input.part },
  });
}

export async function touchCaseVisit(
  personId: string,
  caseId: string,
): Promise<void> {
  const stamp = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((s as StoreBag).solo_case_visits ??= []);
      const i = bag.findIndex(
        (v) => v.person_id === personId && v.case_id === caseId,
      );
      const row = {
        person_id: personId,
        case_id: caseId,
        last_seen_at: stamp,
      };
      if (i >= 0) bag[i] = row;
      else bag.push(row);
    });
    return;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  await getServiceSupabase().from("solo_case_visits").upsert(
    { person_id: personId, case_id: caseId, last_seen_at: stamp },
    { onConflict: "person_id,case_id" },
  );
}

export async function getCaseVisit(
  personId: string,
  caseId: string,
): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (
      ((store as StoreBag).solo_case_visits ?? []).find(
        (v) => v.person_id === personId && v.case_id === caseId,
      )?.last_seen_at ?? null
    );
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("solo_case_visits")
    .select("last_seen_at")
    .eq("person_id", personId)
    .eq("case_id", caseId)
    .maybeSingle();
  return (data?.last_seen_at as string | undefined) ?? null;
}

/** Short "what changed since you last looked" for one case. */
export async function whatChangedSince(input: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<{ line: string; lastSeenAt: string | null }> {
  const lastSeen = await getCaseVisit(input.personId, input.caseId);
  const since = lastSeen ?? "1970-01-01T00:00:00.000Z";
  const bits: string[] = [];

  if (isSampleDataMode()) {
    const store = await readStore();
    const comments = ((store as StoreBag).solo_review_comments ?? []).filter(
      (c) => {
        const rec = ((store as StoreBag).solo_recordings ?? []).find(
          (r) => r.id === c.recording_id,
        );
        return (
          rec?.case_id === input.caseId &&
          c.created_at > since &&
          c.author_id !== input.personId
        );
      },
    );
    if (comments.length) {
      bits.push(
        `${comments.length} new review comment${comments.length === 1 ? "" : "s"}`,
      );
    }
    const handoffs = ((store as StoreBag).solo_handoffs ?? []).filter(
      (h) =>
        h.case_id === input.caseId &&
        h.created_at > since &&
        h.person_id !== input.personId,
    );
    if (handoffs.length) {
      bits.push(
        `${handoffs.length} handoff note${handoffs.length === 1 ? "" : "s"}`,
      );
    }
    const versions = store.claim_map_versions.filter(
      (v) =>
        v.case_id === input.caseId &&
        v.team_id === input.teamId &&
        v.created_at > since,
    );
    if (versions.length) {
      bits.push(
        `stance moved to v${versions[versions.length - 1]!.version}`,
      );
    }
  } else {
    try {
      const { getServiceSupabase } = await import("@/lib/db/supabase/client");
      const sb = getServiceSupabase();
      const { data: recs } = await sb
        .from("solo_recordings")
        .select("id")
        .eq("case_id", input.caseId);
      const recIds = (recs ?? []).map((r) => r.id as string);
      if (recIds.length) {
        const { data: comments } = await sb
          .from("solo_review_comments")
          .select("id,author_id,created_at")
          .in("recording_id", recIds)
          .gt("created_at", since);
        const n = (comments ?? []).filter(
          (c) => c.author_id !== input.personId,
        ).length;
        if (n) bits.push(`${n} new review comment${n === 1 ? "" : "s"}`);
      }
      const { data: handoffs } = await sb
        .from("solo_handoffs")
        .select("id")
        .eq("case_id", input.caseId)
        .neq("person_id", input.personId)
        .gt("created_at", since);
      if (handoffs?.length) {
        bits.push(
          `${handoffs.length} handoff note${handoffs.length === 1 ? "" : "s"}`,
        );
      }
      const { data: versions } = await sb
        .from("claim_map_versions")
        .select("version,created_at")
        .eq("case_id", input.caseId)
        .eq("team_id", input.teamId)
        .gt("created_at", since)
        .order("version", { ascending: false })
        .limit(1);
      if (versions?.[0]) {
        bits.push(`stance moved to v${versions[0].version as number}`);
      }
    } catch {
      // ignore missing tables
    }
  }

  await touchCaseVisit(input.personId, input.caseId);

  if (!bits.length) {
    return {
      line: lastSeen
        ? "Nothing new on this case since you last looked."
        : "First look at this case. No prior visit recorded.",
      lastSeenAt: lastSeen,
    };
  }
  return {
    line: `Since you last looked: ${bits.join("; ")}.`,
    lastSeenAt: lastSeen,
  };
}

export async function createHandoff(input: {
  personId: string;
  teamId: string;
  caseId: string;
  body: string;
}): Promise<SoloHandoff> {
  const text = input.body.trim();
  if (!text) throw new Error("Write a short handoff note.");
  const row: SoloHandoff = {
    id: randomUUID(),
    person_id: input.personId,
    team_id: input.teamId,
    case_id: input.caseId,
    body: text.slice(0, 1000),
    created_at: nowIso(),
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      ((s as StoreBag).solo_handoffs ??= []).push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { error } = await getServiceSupabase()
      .from("solo_handoffs")
      .insert(row);
    if (error) throw new Error(error.message);
  }
  await logActivity({
    person_id: input.personId,
    action: "solo_handoff",
    target: input.caseId,
    meta: { handoff_id: row.id },
  });

  // Notify teammates on the case
  try {
    const roles = await listCaseRoles(input.teamId);
    const others = [
      ...new Set(
        roles
          .filter(
            (r) =>
              r.case_id === input.caseId && r.person_id !== input.personId,
          )
          .map((r) => r.person_id),
      ),
    ];
    const me = await getPersonById(input.personId);
    for (const pid of others) {
      await createNotification({
        personId: pid,
        kind: "solo_handoff",
        title: `${me?.name ?? "Teammate"} left a handoff`,
        body: text.slice(0, 140),
        href: `/prepare?caseId=${input.caseId}`,
        payload: { handoff_id: row.id, case_id: input.caseId },
        createdBy: input.personId,
      });
    }
  } catch {
    // ignore
  }
  return row;
}

export async function listHandoffs(
  caseId: string,
): Promise<(SoloHandoff & { person_name?: string })[]> {
  let rows: SoloHandoff[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    rows = ((store as StoreBag).solo_handoffs ?? [])
      .filter((h) => h.case_id === caseId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows.map((h) => ({
      ...h,
      person_name:
        store.people.find((p) => p.id === h.person_id)?.name ?? "Teammate",
    }));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("solo_handoffs")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  rows = (data as SoloHandoff[]) ?? [];
  const out: (SoloHandoff & { person_name?: string })[] = [];
  for (const h of rows) {
    const p = await getPersonById(h.person_id);
    out.push({ ...h, person_name: p?.name });
  }
  return out;
}

export async function createSoloRecording(input: {
  personId: string;
  teamId: string;
  caseId: string;
  part: SoloPartId;
  title: string;
  durationMs?: number | null;
}): Promise<SoloRecording> {
  const row: SoloRecording = {
    id: randomUUID(),
    person_id: input.personId,
    team_id: input.teamId,
    case_id: input.caseId,
    part: input.part,
    title: input.title.trim() || SOLO_PART_LABELS[input.part],
    storage_path: null,
    duration_ms: input.durationMs ?? null,
    created_at: nowIso(),
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      ((s as StoreBag).solo_recordings ??= []).push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { error } = await getServiceSupabase()
      .from("solo_recordings")
      .insert(row);
    if (error) throw new Error(error.message);
  }
  await logActivity({
    person_id: input.personId,
    action: "solo_recording_created",
    target: row.id,
    meta: { case_id: input.caseId, part: input.part },
  });
  return row;
}

export async function listSoloRecordings(input: {
  teamId: string;
  caseId?: string;
  personId?: string;
}): Promise<SoloRecording[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return ((store as StoreBag).solo_recordings ?? [])
      .filter((r) => {
        if (r.team_id !== input.teamId) return false;
        if (input.caseId && r.case_id !== input.caseId) return false;
        if (input.personId && r.person_id !== input.personId) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  let q = getServiceSupabase()
    .from("solo_recordings")
    .select("*")
    .eq("team_id", input.teamId)
    .order("created_at", { ascending: false });
  if (input.caseId) q = q.eq("case_id", input.caseId);
  if (input.personId) q = q.eq("person_id", input.personId);
  const { data } = await q;
  return (data as SoloRecording[]) ?? [];
}

export async function addReviewComment(input: {
  recordingId: string;
  authorId: string;
  body: string;
  atMs: number;
}): Promise<SoloComment> {
  const text = input.body.trim();
  if (!text) throw new Error("Write a comment.");
  const row: SoloComment = {
    id: randomUUID(),
    recording_id: input.recordingId,
    author_id: input.authorId,
    body: text.slice(0, 800),
    at_ms: Math.max(0, Math.floor(input.atMs)),
    created_at: nowIso(),
  };

  let ownerId: string | null = null;
  let caseId: string | null = null;

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const rec = ((s as StoreBag).solo_recordings ?? []).find(
        (r) => r.id === input.recordingId,
      );
      if (!rec) throw new Error("Recording not found");
      ownerId = rec.person_id;
      caseId = rec.case_id;
      ((s as StoreBag).solo_review_comments ??= []).push(row);
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const { data: rec } = await sb
      .from("solo_recordings")
      .select("person_id,case_id")
      .eq("id", input.recordingId)
      .maybeSingle();
    if (!rec) throw new Error("Recording not found");
    ownerId = rec.person_id as string;
    caseId = rec.case_id as string;
    const { error } = await sb.from("solo_review_comments").insert(row);
    if (error) throw new Error(error.message);
  }

  await logActivity({
    person_id: input.authorId,
    action: "solo_review_comment",
    target: input.recordingId,
    meta: { at_ms: row.at_ms },
  });

  if (ownerId && ownerId !== input.authorId) {
    try {
      const author = await getPersonById(input.authorId);
      const secs = Math.floor(row.at_ms / 1000);
      await createNotification({
        personId: ownerId,
        kind: "solo_review",
        title: `${author?.name ?? "Someone"} left a timed comment`,
        body: `At ${secs}s: ${text.slice(0, 100)}`,
        href: `/prepare/review/${input.recordingId}`,
        payload: {
          recording_id: input.recordingId,
          comment_id: row.id,
          case_id: caseId,
        },
        createdBy: input.authorId,
      });
    } catch {
      // ignore
    }
  }
  return row;
}

export async function listReviewComments(
  recordingId: string,
): Promise<(SoloComment & { author_name?: string })[]> {
  let rows: SoloComment[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    rows = ((store as StoreBag).solo_review_comments ?? [])
      .filter((c) => c.recording_id === recordingId)
      .sort((a, b) => a.at_ms - b.at_ms || a.created_at.localeCompare(b.created_at));
    return rows.map((c) => ({
      ...c,
      author_name:
        store.people.find((p) => p.id === c.author_id)?.name ?? "Teammate",
    }));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("solo_review_comments")
    .select("*")
    .eq("recording_id", recordingId)
    .order("at_ms", { ascending: true });
  rows = (data as SoloComment[]) ?? [];
  const out: (SoloComment & { author_name?: string })[] = [];
  for (const c of rows) {
    const p = await getPersonById(c.author_id);
    out.push({ ...c, author_name: p?.name });
  }
  return out;
}

export async function getSoloRecording(
  id: string,
): Promise<SoloRecording | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (
      ((store as StoreBag).solo_recordings ?? []).find((r) => r.id === id) ??
      null
    );
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("solo_recordings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as SoloRecording | null) ?? null;
}
