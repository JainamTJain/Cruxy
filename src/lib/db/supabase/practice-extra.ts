/**
 * Workstream D extras for practice (new functions only).
 * Do not edit existing exports in practice.ts — add here.
 */
import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import {
  generateSessionCode,
  hashSessionCode,
  normalizeCode,
  verifySessionCode,
} from "@/lib/practice/session-codes";
import { gatePortalVerify, type PortalKind } from "@/lib/practice/ops-bridge";
import type {
  AttendanceStatus,
  BankEntry,
  PracticeRound,
  PracticeSession,
  SkillChart,
  TalkAnalytics,
} from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";
import {
  getSessionById,
  upsertAttendance,
} from "@/lib/db/supabase/practice";

function must<T>(
  result: { data: T; error: { message: string } | null },
  label: string,
): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

/**
 * Join a practice session by code, gated by Workstream I portal brute-force.
 * Prefer this over the older session_code_attempts path in practice.ts.
 */
export async function joinWithSessionCodeGuarded(opts: {
  code: string;
  personId?: string | null;
  ipKey?: string;
  portal?: PortalKind;
}): Promise<
  | { ok: true; session: PracticeSession; rounds: PracticeRound[] }
  | { ok: false; reason: string }
> {
  const portal = opts.portal ?? "session_code";
  const gated = await gatePortalVerify({
    portal,
    ipKey: opts.ipKey,
    personId: opts.personId,
    targetLabel: normalizeCode(opts.code).slice(0, 2) + "****",
    verify: async () => {
      const found = await matchSessionByCode(opts.code);
      if (!found) return { ok: false };
      return { ok: true, value: found };
    },
  });

  if (!gated.ok) {
    return { ok: false, reason: gated.reason };
  }

  const { session, rounds } = gated.value as {
    session: PracticeSession;
    rounds: PracticeRound[];
  };
  if (session.status === "ended") {
    return {
      ok: false,
      reason:
        "This session has ended. The join code and guest links no longer work.",
    };
  }
  if (opts.personId) {
    if (isSampleDataMode()) {
      await updateStore((s) => {
        const existing = s.attendance.find(
          (a) =>
            a.session_id === session.id && a.person_id === opts.personId,
        );
        if (existing) {
          existing.status = "present";
          existing.source = "join";
        } else {
          s.attendance.push({
            id: crypto.randomUUID(),
            session_id: session.id,
            person_id: opts.personId!,
            status: "present",
            source: "join",
            created_at: nowIso(),
          });
        }
      });
    } else {
      await upsertAttendance({
        sessionId: session.id,
        personId: opts.personId,
        status: "present",
        source: "join",
      });
    }
  }
  return { ok: true, session, rounds };
}

async function matchSessionByCode(
  code: string,
): Promise<{ session: PracticeSession; rounds: PracticeRound[] } | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    for (const s of store.practice_sessions) {
      if (!s.code_hash) continue;
      if (await verifySessionCode(s.code_hash, code)) {
        const rounds = store.practice_rounds.filter(
          (r) => r.session_id === s.id,
        );
        return { session: s, rounds };
      }
    }
    return null;
  }

  const sb = getServiceSupabase();
  const rows =
    must(
      await sb
        .from("sessions")
        .select("id, code_hash")
        .not("code_hash", "is", null)
        .order("created_at", { ascending: false }),
      "matchSessionByCode",
    ) ?? [];

  for (const row of rows as { id: string; code_hash: string }[]) {
    if (await verifySessionCode(row.code_hash, code)) {
      const full = await getSessionById(row.id);
      if (!full) return null;
      const { rounds, ...session } = full;
      return { session, rounds };
    }
  }
  return null;
}

export async function revealSessionCode(
  sessionId: string,
  adminId: string,
): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const plain = store.session_admin_codes[sessionId];
    if (plain) {
      await logActivity({
        person_id: adminId,
        action: "session_code_revealed",
        target: sessionId,
      });
      return plain;
    }
    // Fall back: rotate so admin still gets a code
    const code = generateSessionCode();
    const hash = await hashSessionCode(code);
    await updateStore((s) => {
      const session = s.practice_sessions.find((x) => x.id === sessionId);
      if (session) session.code_hash = hash;
      s.session_admin_codes[sessionId] = code;
    });
    await logActivity({
      person_id: adminId,
      action: "session_code_rotated",
      target: sessionId,
    });
    return code;
  }

  // Live: re-issue (same as rotate) — plaintext is not stored in Postgres.
  const sb = getServiceSupabase();
  const code = generateSessionCode();
  const hash = await hashSessionCode(code);
  must(
    await sb.from("sessions").update({ code_hash: hash }).eq("id", sessionId),
    "revealSessionCode",
  );
  await logActivity({
    person_id: adminId,
    action: "session_code_rotated",
    target: sessionId,
  });
  return code;
}

export async function setAttendanceStatus(opts: {
  sessionId: string;
  personId: string;
  status: AttendanceStatus;
  source: "admin" | "self" | "voice" | "join";
  actorId: string;
}) {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const row = s.attendance.find(
        (a) =>
          a.session_id === opts.sessionId && a.person_id === opts.personId,
      );
      if (row) {
        row.status = opts.status;
        row.source = opts.source;
      } else {
        s.attendance.push({
          id: crypto.randomUUID(),
          session_id: opts.sessionId,
          person_id: opts.personId,
          status: opts.status,
          source: opts.source,
          created_at: nowIso(),
        });
      }
    });
    await logActivity({
      person_id: opts.actorId,
      action: "attendance_set",
      target: opts.sessionId,
      meta: { personId: opts.personId, status: opts.status },
    });
    return;
  }

  const sb = getServiceSupabase();
  const existing = must(
    await sb
      .from("attendance")
      .select("id")
      .eq("session_id", opts.sessionId)
      .eq("person_id", opts.personId)
      .maybeSingle(),
    "setAttendanceStatus.lookup",
  );
  if (existing?.id) {
    must(
      await sb
        .from("attendance")
        .update({ status: opts.status, source: opts.source })
        .eq("id", existing.id),
      "setAttendanceStatus.update",
    );
  } else {
    must(
      await sb.from("attendance").insert({
        session_id: opts.sessionId,
        person_id: opts.personId,
        status: opts.status,
        source: opts.source,
      }),
      "setAttendanceStatus.insert",
    );
  }
  await logActivity({
    person_id: opts.actorId,
    action: "attendance_set",
    target: opts.sessionId,
    meta: { personId: opts.personId, status: opts.status },
  });
}

export async function setRoundJudgeMode(opts: {
  roundId: string;
  mode: "in_person" | "cruxy" | "both";
  humanIds?: string[];
  actorId: string;
}) {
  const judges =
    opts.mode === "cruxy"
      ? { humans: [] as string[], cruxy: true }
      : opts.mode === "in_person"
        ? { humans: opts.humanIds ?? [], cruxy: false }
        : { humans: opts.humanIds ?? [], cruxy: true };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const round = s.practice_rounds.find((r) => r.id === opts.roundId);
      if (round) round.judges = judges;
    });
  } else {
    const sb = getServiceSupabase();
    must(
      await sb.from("rounds").update({ judges }).eq("id", opts.roundId),
      "setRoundJudgeMode",
    );
  }
  await logActivity({
    person_id: opts.actorId,
    action: "round_judges_set",
    target: opts.roundId,
    meta: { mode: opts.mode },
  });
}

export async function getReportExtras(roundId: string): Promise<{
  skills: SkillChart[];
  talk: TalkAnalytics[];
  bank: BankEntry[];
  people: { id: string; name: string; team_id: string | null }[];
  teams: { id: string; name: string; colour: string }[];
  judges: { id: string; name: string; person_id: string | null }[];
}> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const feedback = store.feedback_items.filter((f) => f.round_id === roundId);
    const personIds = [
      ...new Set(feedback.map((f) => f.person_id)),
      ...store.talk_analytics
        .filter((t) => t.round_id === roundId)
        .map((t) => t.person_id),
    ];
    return {
      skills: store.skill_charts.filter((c) => personIds.includes(c.person_id)),
      talk: store.talk_analytics.filter((t) => t.round_id === roundId),
      bank: store.bank_entries,
      people: store.people.map((p) => ({
        id: p.id,
        name: p.name,
        team_id: p.team_id,
      })),
      teams: store.teams.map((t) => ({
        id: t.id,
        name: t.name,
        colour: t.colour,
      })),
      judges: store.judges.map((j) => ({
        id: j.id,
        name: j.name,
        person_id: j.person_id,
      })),
    };
  }

  const sb = getServiceSupabase();
  const [skills, talk, bank, people, teams, judges] = await Promise.all([
    must(await sb.from("skill_charts").select("*"), "getReportExtras.skills"),
    must(
      await sb.from("talk_analytics").select("*").eq("round_id", roundId),
      "getReportExtras.talk",
    ),
    must(await sb.from("bank_entries").select("*"), "getReportExtras.bank"),
    must(
      await sb.from("people").select("id,name,team_id"),
      "getReportExtras.people",
    ),
    must(
      await sb.from("teams").select("id,name,colour"),
      "getReportExtras.teams",
    ),
    must(
      await sb.from("judges").select("id,name,person_id"),
      "getReportExtras.judges",
    ),
  ]);

  return {
    skills: (skills ?? []) as SkillChart[],
    talk: (talk ?? []) as TalkAnalytics[],
    bank: (bank ?? []) as BankEntry[],
    people: (people ?? []) as {
      id: string;
      name: string;
      team_id: string | null;
    }[],
    teams: (teams ?? []) as { id: string; name: string; colour: string }[],
    judges: (judges ?? []) as {
      id: string;
      name: string;
      person_id: string | null;
    }[],
  };
}

export async function listSessionRoster(sessionId: string): Promise<{
  people: {
    id: string;
    name: string;
    team_id: string | null;
    team_name: string | null;
    recording_ok: boolean;
  }[];
  joinedJudgeIds: string[];
}> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const rounds = store.practice_rounds.filter(
      (r) => r.session_id === sessionId,
    );
    const humanIds = new Set(rounds.flatMap((r) => r.judges.humans));
    const joined = store.judges
      .filter((j) => j.person_id && humanIds.has(j.person_id))
      .map((j) => j.person_id!);
    // Also treat attendance join from known judges as joined
    const attJoined = store.attendance
      .filter(
        (a) =>
          a.session_id === sessionId &&
          a.status !== "absent" &&
          humanIds.has(a.person_id),
      )
      .map((a) => a.person_id);
    return {
      people: store.people.map((p) => ({
        id: p.id,
        name: p.name,
        team_id: p.team_id,
        team_name: store.teams.find((t) => t.id === p.team_id)?.name ?? null,
        recording_ok: Boolean(p.recording_ok),
      })),
      joinedJudgeIds: [...new Set([...joined, ...attJoined])],
    };
  }

  const sb = getServiceSupabase();
  const people =
    must(
      await sb.from("people").select("id,name,team_id,recording_ok"),
      "listSessionRoster.people",
    ) ?? [];
  const teams =
    must(await sb.from("teams").select("id,name"), "listSessionRoster.teams") ??
    [];
  const teamName = Object.fromEntries(
    teams.map((t: { id: string; name: string }) => [t.id, t.name]),
  );
  return {
    people: people.map(
      (p: {
        id: string;
        name: string;
        team_id: string | null;
        recording_ok: boolean | null;
      }) => ({
        id: p.id,
        name: p.name,
        team_id: p.team_id,
        team_name: p.team_id ? (teamName[p.team_id] ?? null) : null,
        recording_ok: Boolean(p.recording_ok),
      }),
    ),
    joinedJudgeIds: [],
  };
}
