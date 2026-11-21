import "server-only";
import {
  getPersonById,
  listPeoplePublic,
  logActivity,
} from "@/lib/db/repository";
import {
  listAttendance,
  upsertAttendance,
} from "@/lib/db/practice-repository";
import { isSampleDataMode } from "@/lib/db/config";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";
import type {
  AttendanceRow,
  AttendanceSource,
  AttendanceStatus,
} from "@/lib/practice/types";

export type AttendanceDetailed = AttendanceRow & {
  name: string;
  team_id: string | null;
  recording_ok: boolean;
  text_only: boolean;
  suggested?: boolean;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
};

export async function listAttendanceDetailed(
  sessionId: string,
): Promise<AttendanceDetailed[]> {
  const rows = await listAttendance(sessionId);
  const { people } = await listPeoplePublic();
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: AttendanceDetailed[] = [];
  for (const row of rows) {
    const person = await getPersonById(row.person_id);
    const pub = byId.get(row.person_id);
    // Missing person or unset consent: treat as text only (never assume recordable).
    const recordingOk = Boolean(person?.recording_ok);
    out.push({
      ...row,
      name: person?.name ?? pub?.name ?? row.person_id,
      team_id: person?.team_id ?? pub?.team_id ?? null,
      recording_ok: recordingOk,
      text_only: !recordingOk,
      suggested: (row as AttendanceRow & { suggested?: boolean }).suggested,
      confirmed_by: (row as AttendanceRow & { confirmed_by?: string | null })
        .confirmed_by,
      confirmed_at: (row as AttendanceRow & { confirmed_at?: string | null })
        .confirmed_at,
    });
  }
  return out;
}

export async function sessionHasTextOnlyMembers(
  sessionId: string,
): Promise<{ hasTextOnly: boolean; names: string[] }> {
  const rows = await listAttendanceDetailed(sessionId);
  const textOnly = rows.filter((r) => r.text_only);
  return {
    hasTextOnly: textOnly.length > 0,
    names: textOnly.map((r) => r.name),
  };
}

export async function markAttendanceAdmin(opts: {
  actorId: string;
  sessionId: string;
  personId: string;
  status: AttendanceStatus;
}): Promise<AttendanceRow> {
  const row = await upsertAttendance({
    sessionId: opts.sessionId,
    personId: opts.personId,
    status: opts.status,
    source: "admin",
  });
  await clearSuggestion(opts.sessionId, opts.personId, opts.actorId);
  await logActivity({
    person_id: opts.actorId,
    action: "attendance_marked",
    target: opts.sessionId,
    meta: {
      person_id: opts.personId,
      status: opts.status,
      source: "admin",
    },
  });
  return row;
}

export async function markSelfHere(opts: {
  personId: string;
  sessionId: string;
}): Promise<AttendanceRow> {
  const row = await upsertAttendance({
    sessionId: opts.sessionId,
    personId: opts.personId,
    status: "present",
    source: "self",
  });
  await logActivity({
    person_id: opts.personId,
    action: "attendance_self",
    target: opts.sessionId,
    meta: { status: "present" },
  });
  return row;
}

/** Prefill present from devices that joined the session. */
export async function prefillFromJoins(
  sessionId: string,
  joinedPersonIds: string[],
): Promise<AttendanceRow[]> {
  const out: AttendanceRow[] = [];
  for (const personId of joinedPersonIds) {
    const existing = (await listAttendance(sessionId)).find(
      (r) => r.person_id === personId,
    );
    if (existing && !isSuggested(existing)) continue;
    const row = await upsertAttendance({
      sessionId,
      personId,
      status: "present",
      source: "join",
    });
    await markSuggested(sessionId, personId, true);
    out.push(row);
  }
  return out;
}

/** Prefill from voice-matched person ids (Cruxy / AssemblyAI). */
export async function prefillFromVoiceMatches(
  sessionId: string,
  matchedPersonIds: string[],
): Promise<AttendanceRow[]> {
  const out: AttendanceRow[] = [];
  for (const personId of matchedPersonIds) {
    const row = await upsertAttendance({
      sessionId,
      personId,
      status: "present",
      source: "voice",
    });
    await markSuggested(sessionId, personId, true);
    out.push(row);
  }
  return out;
}

/** Admin confirms every suggested row in one tap. */
export async function confirmAttendanceSuggestions(opts: {
  actorId: string;
  sessionId: string;
}): Promise<number> {
  const rows = await listAttendance(opts.sessionId);
  let n = 0;
  for (const row of rows) {
    if (!isSuggested(row)) continue;
    await clearSuggestion(opts.sessionId, row.person_id, opts.actorId);
    n += 1;
  }
  await logActivity({
    person_id: opts.actorId,
    action: "attendance_confirmed",
    target: opts.sessionId,
    meta: { count: n },
  });
  return n;
}

/** Solo practice: log the person present against a synthetic or real session id. */
export async function logSoloAttendance(opts: {
  personId: string;
  sessionId: string;
}): Promise<AttendanceRow> {
  const row = await upsertAttendance({
    sessionId: opts.sessionId,
    personId: opts.personId,
    status: "present",
    source: "self",
  });
  await logActivity({
    person_id: opts.personId,
    action: "attendance_solo",
    target: opts.sessionId,
  });
  return row;
}

export async function attendanceStatsForPerson(
  personId: string,
): Promise<{ sessions: number; present: number; late: number; absent: number }> {
  const rows = await listAllAttendanceForPerson(personId);
  return {
    sessions: rows.length,
    present: rows.filter((r) => r.status === "present").length,
    late: rows.filter((r) => r.status === "late").length,
    absent: rows.filter((r) => r.status === "absent").length,
  };
}

export async function attendanceForWeeklySummary(): Promise<
  { person_id: string; name: string; sessions: number; present: number }[]
> {
  const { people } = await listPeoplePublic();
  const out: {
    person_id: string;
    name: string;
    sessions: number;
    present: number;
  }[] = [];
  for (const p of people) {
    if (p.role !== "member" && p.role !== "tech_admin") continue;
    const stats = await attendanceStatsForPerson(p.id);
    if (stats.sessions === 0) continue;
    out.push({
      person_id: p.id,
      name: p.name,
      sessions: stats.sessions,
      present: stats.present,
    });
  }
  return out;
}

async function listAllAttendanceForPerson(
  personId: string,
): Promise<AttendanceRow[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.attendance.filter((r) => r.person_id === personId);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("attendance")
    .select("*")
    .eq("person_id", personId);
  assertOk(error, "listAllAttendanceForPerson");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    session_id: r.session_id as string,
    person_id: r.person_id as string,
    status: r.status as AttendanceStatus,
    source: r.source as AttendanceSource,
    created_at: r.created_at as string,
  }));
}

function isSuggested(row: AttendanceRow): boolean {
  return Boolean((row as AttendanceRow & { suggested?: boolean }).suggested);
}

async function markSuggested(
  sessionId: string,
  personId: string,
  suggested: boolean,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const row = s.attendance.find(
        (a) => a.session_id === sessionId && a.person_id === personId,
      );
      if (row) {
        (row as AttendanceRow & { suggested?: boolean }).suggested = suggested;
      }
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("attendance")
    .update({ suggested })
    .eq("session_id", sessionId)
    .eq("person_id", personId);
  assertOk(error, "markSuggested");
}

async function clearSuggestion(
  sessionId: string,
  personId: string,
  actorId: string,
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const row = s.attendance.find(
        (a) => a.session_id === sessionId && a.person_id === personId,
      );
      if (row) {
        const ext = row as AttendanceRow & {
          suggested?: boolean;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
        };
        ext.suggested = false;
        ext.confirmed_by = actorId;
        ext.confirmed_at = nowIso();
      }
    });
    return;
  }
  const sb = getServiceSupabase();
  const { error } = await sb
    .from("attendance")
    .update({
      suggested: false,
      confirmed_by: actorId,
      confirmed_at: nowIso(),
    })
    .eq("session_id", sessionId)
    .eq("person_id", personId);
  assertOk(error, "clearSuggestion");
}

/** Ensure a blank attendance row exists (used when seeding a session roster). */
export async function ensureAttendanceRow(opts: {
  sessionId: string;
  personId: string;
  status?: AttendanceStatus;
  source?: AttendanceSource;
}): Promise<AttendanceRow> {
  const existing = (await listAttendance(opts.sessionId)).find(
    (r) => r.person_id === opts.personId,
  );
  if (existing) return existing;
  if (!opts.status) {
    // Placeholder absent until marked; upsert requires a status.
    return upsertAttendance({
      sessionId: opts.sessionId,
      personId: opts.personId,
      status: "absent",
      source: opts.source ?? "admin",
    });
  }
  return upsertAttendance({
    sessionId: opts.sessionId,
    personId: opts.personId,
    status: opts.status,
    source: opts.source ?? "admin",
  });
}
