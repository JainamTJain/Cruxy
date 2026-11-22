/**
 * Wave 9 K: coach "who is behind" view per team + nudge + weekly report data.
 */
import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import {
  listPeopleFull,
  listTeams,
  logActivity,
} from "@/lib/db/repository";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore } from "@/lib/db/sample-store";
import { listChecklist, getTeamBrief } from "@/lib/db/supabase/team-brief-extra";
import { nowIso } from "@/lib/utils";

const STALE_DAYS = 5;

export type CoachMemberRow = {
  personId: string;
  name: string;
  lastPractisedAt: string | null;
  stale: boolean;
  attendancePresent: number;
  attendanceTotal: number;
  roadmapDone: number;
  roadmapTotal: number;
  roadmapLine: string;
};

export type CoachBriefItem = {
  caseNumber: number | null;
  caseTitle: string;
  text: string;
  kind: string;
};

export type CoachTeamSnapshot = {
  teamId: string;
  teamName: string;
  members: CoachMemberRow[];
  openBriefItems: CoachBriefItem[];
  generatedAt: string;
};

async function lastPracticeByPerson(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const bump = (personId: string, at: string) => {
    const prev = map.get(personId);
    if (!prev || at > prev) map.set(personId, at);
  };

  if (isSampleDataMode()) {
    const store = await readStore();
    for (const a of store.attendance ?? []) {
      if (a.status === "present" || a.status === "late") {
        bump(a.person_id, a.created_at);
      }
    }
    for (const s of store.practice_speak_logs ?? []) {
      if (s.spoken) bump(s.person_id, s.created_at);
    }
    for (const r of store.card_reviews ?? []) {
      bump(r.person_id, r.created_at);
    }
    for (const a of store.answers ?? []) {
      bump(a.person_id, a.created_at);
    }
    return map;
  }

  const sb = getServiceSupabase();
  const [att, speak, reviews, answers] = await Promise.all([
    sb
      .from("attendance")
      .select("person_id, created_at, status")
      .in("status", ["present", "late"])
      .order("created_at", { ascending: false })
      .limit(2000),
    sb
      .from("practice_speak_logs")
      .select("person_id, created_at, spoken")
      .eq("spoken", true)
      .order("created_at", { ascending: false })
      .limit(2000),
    sb
      .from("card_reviews")
      .select("person_id, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    sb
      .from("answers")
      .select("person_id, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  for (const row of att.data ?? []) {
    bump(String(row.person_id), String(row.created_at));
  }
  for (const row of speak.data ?? []) {
    bump(String(row.person_id), String(row.created_at));
  }
  for (const row of reviews.data ?? []) {
    bump(String(row.person_id), String(row.created_at));
  }
  for (const row of answers.data ?? []) {
    bump(String(row.person_id), String(row.created_at));
  }
  return map;
}

async function attendanceCountsByPerson(): Promise<
  Map<string, { present: number; total: number }>
> {
  const map = new Map<string, { present: number; total: number }>();
  const add = (personId: string, present: boolean) => {
    const cur = map.get(personId) ?? { present: 0, total: 0 };
    cur.total += 1;
    if (present) cur.present += 1;
    map.set(personId, cur);
  };

  if (isSampleDataMode()) {
    const store = await readStore();
    for (const a of store.attendance ?? []) {
      add(a.person_id, a.status === "present" || a.status === "late");
    }
    return map;
  }

  const { data, error } = await getServiceSupabase()
    .from("attendance")
    .select("person_id, status")
    .order("created_at", { ascending: false })
    .limit(3000);
  assertOk(error, "attendanceCountsByPerson");
  for (const row of data ?? []) {
    const status = String(row.status);
    add(
      String(row.person_id),
      status === "present" || status === "late",
    );
  }
  return map;
}

async function roadmapByPerson(): Promise<
  Map<string, { done: number; total: number }>
> {
  const map = new Map<string, { done: number; total: number }>();
  const add = (personId: string, done: boolean) => {
    const cur = map.get(personId) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (done) cur.done += 1;
    map.set(personId, cur);
  };

  if (isSampleDataMode()) {
    const store = await readStore();
    for (const r of store.roadmap_stages ?? []) {
      add(r.person_id, Boolean(r.done_at));
    }
    return map;
  }

  const { data, error } = await getServiceSupabase()
    .from("roadmap_stages")
    .select("person_id, done_at");
  assertOk(error, "roadmapByPerson");
  for (const row of data ?? []) {
    add(String(row.person_id), Boolean(row.done_at));
  }
  return map;
}

async function openBriefItemsForTeam(
  teamId: string,
): Promise<CoachBriefItem[]> {
  const items: CoachBriefItem[] = [];
  let cases: { id: string; number: number; title: string }[] = [];

  if (isSampleDataMode()) {
    const store = await readStore();
    cases = store.cases.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
    }));
  } else {
    const { data, error } = await getServiceSupabase()
      .from("cases")
      .select("id, number, title")
      .eq("active", true);
    assertOk(error, "openBriefItems.cases");
    cases = (data ?? []).map((c) => ({
      id: String(c.id),
      number: Number(c.number),
      title: String(c.title),
    }));
  }

  for (const c of cases) {
    const brief = await getTeamBrief(teamId, c.id);
    if (!brief) continue;
    const checklist = await listChecklist(brief.id);
    for (const row of checklist.filter((x) => !x.done)) {
      items.push({
        caseNumber: c.number,
        caseTitle: c.title,
        text: row.text,
        kind: row.kind,
      });
    }
  }
  return items.slice(0, 40);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export async function getCoachTeamSnapshot(
  teamId: string,
): Promise<CoachTeamSnapshot | null> {
  const teams = await listTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return null;

  const people = (await listPeopleFull()).filter(
    (p) =>
      p.team_id === teamId &&
      (p.role === "member" || p.role === "tech_admin"),
  );
  const [practice, attendance, roadmap, openBriefItems] = await Promise.all([
    lastPracticeByPerson(),
    attendanceCountsByPerson(),
    roadmapByPerson(),
    openBriefItemsForTeam(teamId),
  ]);

  const members: CoachMemberRow[] = people.map((p) => {
    const last =
      practice.get(p.id) ?? p.last_sign_in_at ?? null;
    const staleDays = daysSince(last);
    const att = attendance.get(p.id) ?? { present: 0, total: 0 };
    const rm = roadmap.get(p.id) ?? { done: 0, total: 0 };
    const pct = rm.total ? Math.round((rm.done / rm.total) * 100) : 0;
    return {
      personId: p.id,
      name: p.name,
      lastPractisedAt: last,
      stale: staleDays === null || staleDays >= STALE_DAYS,
      attendancePresent: att.present,
      attendanceTotal: att.total,
      roadmapDone: rm.done,
      roadmapTotal: rm.total,
      roadmapLine:
        rm.total === 0
          ? "No roadmap stages yet"
          : `${rm.done} of ${rm.total} stages done (${pct}%), against their own past only`,
    };
  });

  members.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    teamId: team.id,
    teamName: team.name,
    members,
    openBriefItems,
    generatedAt: nowIso(),
  };
}

export async function listCoachTeams(): Promise<
  { teamId: string; teamName: string; staleCount: number; memberCount: number }[]
> {
  const teams = await listTeams();
  const out = [];
  for (const t of teams) {
    const snap = await getCoachTeamSnapshot(t.id);
    if (!snap) continue;
    out.push({
      teamId: t.id,
      teamName: t.name,
      staleCount: snap.members.filter((m) => m.stale).length,
      memberCount: snap.members.length,
    });
  }
  return out;
}

export async function sendCoachNudge(opts: {
  actorId: string;
  personId: string;
  teamId: string;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await listPeopleFull().then((p) =>
    p.find((x) => x.id === opts.actorId),
  );
  if (
    !actor ||
    (actor.role !== "coach_admin" && actor.role !== "tech_admin")
  ) {
    return { ok: false, error: "Coach only." };
  }
  const target = await listPeopleFull().then((p) =>
    p.find((x) => x.id === opts.personId),
  );
  if (!target || target.team_id !== opts.teamId) {
    return { ok: false, error: "Person not on this team." };
  }

  const body =
    opts.note?.trim() ||
    "A short practice this week would help. Open Today for the next step.";

  await createNotification({
    personId: opts.personId,
    kind: "coach_nudge",
    title: `${actor.name} sent a gentle nudge`,
    body,
    href: "/today",
    createdBy: opts.actorId,
    payload: { teamId: opts.teamId },
  });

  await logActivity({
    person_id: opts.actorId,
    action: "coach_nudge_sent",
    target: opts.personId,
    meta: { teamId: opts.teamId },
  });

  return { ok: true };
}

export function formatCoachReportText(snap: CoachTeamSnapshot): string {
  const lines: string[] = [
    `Crux weekly team report: ${snap.teamName}`,
    `Generated ${new Date(snap.generatedAt).toLocaleString()}`,
    "",
    "People",
  ];
  for (const m of snap.members) {
    const last = m.lastPractisedAt
      ? new Date(m.lastPractisedAt).toLocaleDateString()
      : "never";
    lines.push(
      `- ${m.name}: attendance ${m.attendancePresent}/${m.attendanceTotal}; last practice ${last}${m.stale ? " (5+ days)" : ""}; ${m.roadmapLine}`,
    );
  }
  lines.push("", "Open Team Brief items");
  if (!snap.openBriefItems.length) {
    lines.push("- None open");
  } else {
    for (const item of snap.openBriefItems) {
      lines.push(
        `- Case ${item.caseNumber ?? "?"}: ${item.text} (${item.kind})`,
      );
    }
  }
  lines.push(
    "",
    "Progress is each person against their own past only. No leaderboards.",
  );
  return lines.join("\n");
}
