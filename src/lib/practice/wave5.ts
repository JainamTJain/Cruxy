/**
 * Wave 5 practice helpers: today's join, invites, layouts, ideas, skills, bank.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { createProposal } from "@/lib/case-brain/service";
import {
  getPersonById,
  listPeopleFull,
  listTeams,
  logActivity,
} from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import {
  getRoundById,
  getSkillChart,
  listBankEntries,
  listSessions,
  saveSkillChart,
} from "@/lib/db/practice-repository";
import type {
  PracticeRound,
  RecordingLayout,
  SkillChart,
  TranscriptLine,
} from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

export type TodaySessionCard = {
  sessionId: string;
  roundId: string | null;
  title: string;
  place: string | null;
  online: boolean;
  status: string;
  caseNumber: number | null;
  screen: "presenter" | "commenter" | "observer" | "moderator" | "judge";
  href: string;
  invitePending?: boolean;
};

function screenFor(
  round: PracticeRound | undefined,
  teamId: string | null,
  personId: string,
): TodaySessionCard["screen"] {
  if (!round) return "observer";
  if (round.moderator === personId) return "moderator";
  if (teamId && round.sides.presenting === teamId) return "presenter";
  if (teamId && round.sides.commenting === teamId) return "commenter";
  if (round.judges.humans.includes(personId)) return "judge";
  return "observer";
}

function hrefFor(screen: TodaySessionCard["screen"], roundId: string | null) {
  if (!roundId) return "/practice";
  if (screen === "judge") return `/judging?round=${roundId}`;
  return `/practice/rounds/${roundId}`;
}

/** F-189: today's sessions for the signed-in person, with Join routing. */
export async function listTodaySessionsForPerson(opts: {
  personId: string;
  teamId: string | null;
}): Promise<TodaySessionCard[]> {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await listSessions({
    forPersonId: opts.personId,
    admin: false,
  });
  const out: TodaySessionCard[] = [];

  for (const s of sessions) {
    if (s.date !== today && s.status !== "live") continue;
    const invited =
      opts.teamId != null && s.invite_team_ids.includes(opts.teamId);
    const mine =
      s.created_by === opts.personId ||
      s.rounds.some(
        (r) =>
          (opts.teamId && r.team_ids.includes(opts.teamId)) ||
          r.moderator === opts.personId ||
          r.judges.humans.includes(opts.personId),
      );
    if (!mine && !invited && s.kind === "member_practice") {
      // Still show if they are on an invited team and pending accept
      if (!invited) continue;
    }
    const round = s.rounds[0];
    const screen = screenFor(round, opts.teamId, opts.personId);
    out.push({
      sessionId: s.id,
      roundId: round?.id ?? null,
      title: s.title,
      place: s.place,
      online: s.online,
      status: s.status,
      caseNumber: round?.case_number ?? null,
      screen,
      href: hrefFor(screen, round?.id ?? null),
      invitePending: invited && !mine,
    });
  }
  return out;
}

/** F-200: invite another team; notify each member. */
export async function inviteTeamToSession(opts: {
  sessionId: string;
  teamId: string;
  invitedBy: string;
}): Promise<{ ok: true; notified: number } | { ok: false; reason: string }> {
  const sessions = await listSessions({ admin: true });
  const session = sessions.find((s) => s.id === opts.sessionId);
  if (!session) return { ok: false, reason: "Session not found" };

  const teams = await listTeams();
  const team = teams.find((t) => t.id === opts.teamId);
  if (!team) return { ok: false, reason: "Team not found" };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const row = s.practice_sessions.find((x) => x.id === opts.sessionId);
      if (!row) return;
      if (!row.invite_team_ids.includes(opts.teamId)) {
        row.invite_team_ids = [...row.invite_team_ids, opts.teamId];
      }
    });
  } else {
    const sb = getServiceSupabase();
    const ids = [...new Set([...session.invite_team_ids, opts.teamId])];
    const { error } = await sb
      .from("sessions")
      .update({ invite_team_ids: ids })
      .eq("id", opts.sessionId);
    if (error) throw new Error(`inviteTeam: ${error.message}`);
  }

  const people = await listPeopleFull();
  const members = people.filter((p) => p.team_id === opts.teamId);
  let notified = 0;
  for (const p of members) {
    await createNotification({
      personId: p.id,
      kind: "practice_invite",
      title: `Invited to ${session.title}`,
      body: `${team.name} is invited to join today's practice. Accept from Home.`,
      href: `/practice/sessions/${session.id}`,
      createdBy: opts.invitedBy,
      payload: { sessionId: session.id, teamId: opts.teamId },
    });
    notified += 1;
  }

  await logActivity({
    person_id: opts.invitedBy,
    action: "practice_team_invited",
    target: opts.sessionId,
    meta: { teamId: opts.teamId, notified },
  });

  return { ok: true, notified };
}

/** F-200: accept invite in one tap (marks attendance + clears pending). */
export async function acceptSessionInvite(opts: {
  sessionId: string;
  personId: string;
  teamId: string | null;
}): Promise<{ ok: true; href: string } | { ok: false; reason: string }> {
  const sessions = await listSessions({
    forPersonId: opts.personId,
    admin: true,
  });
  const session = sessions.find((s) => s.id === opts.sessionId);
  if (!session) return { ok: false, reason: "Session not found" };
  if (
    opts.teamId &&
    session.invite_team_ids.length &&
    !session.invite_team_ids.includes(opts.teamId)
  ) {
    return { ok: false, reason: "This invite is for another team" };
  }

  const { upsertAttendance } = await import("@/lib/db/practice-repository");
  await upsertAttendance({
    sessionId: opts.sessionId,
    personId: opts.personId,
    status: "present",
    source: "join",
  });
  await logActivity({
    person_id: opts.personId,
    action: "practice_invite_accepted",
    target: opts.sessionId,
  });

  const round = session.rounds[0];
  const screen = screenFor(round, opts.teamId, opts.personId);
  return { ok: true, href: hrefFor(screen, round?.id ?? null) };
}

/** F-204: member practices visible on the program map / activity. */
export async function listRecentMemberPractices(limit = 12): Promise<
  {
    id: string;
    title: string;
    date: string;
    status: string;
    created_by: string | null;
    creator_name: string | null;
    mode: string | null;
  }[]
> {
  const sessions = await listSessions({ admin: true });
  const member = sessions
    .filter((s) => s.kind === "member_practice")
    .slice(0, limit);
  const out = [];
  for (const s of member) {
    const creator = s.created_by ? await getPersonById(s.created_by) : null;
    out.push({
      id: s.id,
      title: s.title,
      date: s.date,
      status: s.status,
      created_by: s.created_by,
      creator_name: creator?.name ?? null,
      mode: s.mode,
    });
  }
  return out;
}

/** F-218 / F-219 / F-220: set how this round records. */
export async function setRoundRecordingLayout(opts: {
  roundId: string;
  layout: RecordingLayout;
  actorId: string;
}): Promise<PracticeRound | null> {
  const round = await getRoundById(opts.roundId);
  if (!round) return null;

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const r = s.practice_rounds.find((x) => x.id === opts.roundId);
      if (r) r.recording_layout = opts.layout;
    });
  } else {
    const sb = getServiceSupabase();
    const { error } = await sb
      .from("rounds")
      .update({ recording_layout: opts.layout })
      .eq("id", opts.roundId);
    if (error) throw new Error(`setRoundRecordingLayout: ${error.message}`);
  }

  await logActivity({
    person_id: opts.actorId,
    action: "recording_layout_set",
    target: opts.roundId,
    meta: { layout: opts.layout },
  });

  return { ...round, recording_layout: opts.layout };
}

/**
 * F-276: ideas raised in the round → team's Evidence Library queue.
 * Uses cited transcript lines as origin.
 */
export async function queueRoundIdeasToTruthSources(opts: {
  roundId: string;
  teamId: string;
  personId: string;
  ideas: { text: string; lineId: string | null }[];
}): Promise<{ queued: number; proposalIds: string[] }> {
  const round = await getRoundById(opts.roundId);
  if (!round?.case_id) return { queued: 0, proposalIds: [] };

  const proposalIds: string[] = [];
  for (const idea of opts.ideas) {
    if (!idea.text.trim()) continue;
    const proposal = await createProposal({
      caseId: round.case_id,
      teamId: opts.teamId,
      personId: opts.personId,
      ideaKey: `practice:${opts.roundId}:${idea.lineId ?? randomUUID().slice(0, 8)}`,
      kind: "other",
      text: idea.text.trim(),
      origin: "transcript",
      originRef: idea.lineId
        ? `Practice round ${opts.roundId}, line ${idea.lineId}`
        : `Practice round ${opts.roundId}`,
      citationIds: idea.lineId ? [idea.lineId] : [],
    });
    proposalIds.push(proposal.id);
  }

  if (proposalIds.length) {
    await logActivity({
      person_id: opts.personId,
      action: "practice_ideas_queued",
      target: opts.roundId,
      meta: { count: proposalIds.length, teamId: opts.teamId },
    });
  }

  return { queued: proposalIds.length, proposalIds };
}

const SKILL_LABELS: Record<keyof SkillChart["skills"], string> = {
  answer_first: "Answer first",
  explain_frameworks: "Explain frameworks",
  engage_objections: "Engage objections",
  stay_under_time: "Stay under time",
  commentary_focus: "Commentary focus",
};

/**
 * F-278: a skill flat for two rounds → roadmap task with a specific drill.
 * Tracks last two snapshots on the skill chart meta via skills history bag.
 */
export async function applySkillStallRoadmapTasks(opts: {
  personId: string;
  caseId: string | null;
  chart: SkillChart;
}): Promise<{ stalled: string[]; roadmapAdded: number }> {
  type Hist = { at: string; skills: SkillChart["skills"] };

  let history: Hist[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = (store as { skill_history?: Record<string, Hist[]> })
      .skill_history;
    history = bag?.[opts.personId] ?? [];
  } else {
    // Live: pull recent skill snapshots from activity_log.
    const sb = getServiceSupabase();
    const { data } = await sb
      .from("activity_log")
      .select("created_at, meta")
      .eq("person_id", opts.personId)
      .eq("action", "skill_chart_snapshot")
      .order("created_at", { ascending: false })
      .limit(3);
    history = ((data ?? []) as { created_at: string; meta: { skills?: SkillChart["skills"] } | null }[])
      .reverse()
      .map((row) => ({
        at: row.created_at,
        skills: row.meta?.skills ?? opts.chart.skills,
      }));
  }

  history = [...history, { at: nowIso(), skills: { ...opts.chart.skills } }].slice(
    -3,
  );

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as { skill_history?: Record<string, Hist[]> };
      if (!bag.skill_history) bag.skill_history = {};
      bag.skill_history[opts.personId] = history;
    });
  } else {
    await logActivity({
      person_id: opts.personId,
      action: "skill_chart_snapshot",
      target: opts.caseId,
      meta: { skills: opts.chart.skills },
    });
  }

  const stalled: string[] = [];
  if (history.length >= 3) {
    const [a, b, c] = history.slice(-3);
    for (const key of Object.keys(SKILL_LABELS) as (keyof SkillChart["skills"])[]) {
      const v0 = a!.skills[key] ?? 5;
      const v1 = b!.skills[key] ?? 5;
      const v2 = c!.skills[key] ?? 5;
      if (v2 <= v1 && v1 <= v0) stalled.push(key);
    }
  }

  let roadmapAdded = 0;
  if (!stalled.length || !opts.caseId) {
    return { stalled, roadmapAdded };
  }

  if (isSampleDataMode()) {
    await updateStore((s) => {
      for (const key of stalled) {
        const stage = `skill_drill:${key}`;
        const exists = s.roadmap_stages.some(
          (r) =>
            r.person_id === opts.personId &&
            r.case_id === opts.caseId &&
            r.stage === stage &&
            !r.done_at,
        );
        if (exists) continue;
        s.roadmap_stages.push({
          id: randomUUID(),
          person_id: opts.personId,
          case_id: opts.caseId!,
          stage,
          required: true,
          due: null,
          done_at: null,
          created_at: nowIso(),
          created_by: opts.personId,
        });
        roadmapAdded += 1;
      }
    });
  } else {
    const sb = getServiceSupabase();
    for (const key of stalled) {
      const stage = `skill_drill:${key}`;
      const existing = await sb
        .from("roadmap_stages")
        .select("id")
        .eq("person_id", opts.personId)
        .eq("case_id", opts.caseId)
        .eq("stage", stage)
        .is("done_at", null)
        .maybeSingle();
      if (existing.data?.id) continue;
      const { error } = await sb.from("roadmap_stages").insert({
        person_id: opts.personId,
        case_id: opts.caseId,
        stage,
        required: true,
        created_by: opts.personId,
      });
      if (error) throw new Error(`skillStallRoadmap: ${error.message}`);
      roadmapAdded += 1;
    }
  }

  if (roadmapAdded) {
    await logActivity({
      person_id: opts.personId,
      action: "skill_stall_roadmap",
      target: opts.caseId,
      meta: { stalled, roadmapAdded },
    });
  }

  return { stalled, roadmapAdded };
}

/** F-281: mark "I do this" → bank commitment + roadmap drill. */
export async function markBankDoThis(opts: {
  bankEntryId: string;
  personId: string;
  caseId: string | null;
}): Promise<{ ok: true; roadmapStageId: string } | { ok: false; reason: string }> {
  const entries = await listBankEntries();
  const entry = entries.find((e) => e.id === opts.bankEntryId);
  if (!entry) return { ok: false, reason: "Bank entry not found" };

  const stage = `bank_drill:${opts.bankEntryId}`;
  let roadmapStageId: string = randomUUID();

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as {
        bank_commitments?: {
          id: string;
          bank_entry_id: string;
          person_id: string;
          roadmap_stage_id: string | null;
          created_at: string;
        }[];
      };
      if (!bag.bank_commitments) bag.bank_commitments = [];
      const existing = bag.bank_commitments.find(
        (c) =>
          c.bank_entry_id === opts.bankEntryId &&
          c.person_id === opts.personId,
      );
      if (existing) {
        roadmapStageId = existing.roadmap_stage_id ?? roadmapStageId;
        return;
      }
      if (opts.caseId) {
        s.roadmap_stages.push({
          id: roadmapStageId as `${string}-${string}-${string}-${string}-${string}`,
          person_id: opts.personId,
          case_id: opts.caseId,
          stage,
          required: false,
          due: null,
          done_at: null,
          created_at: nowIso(),
          created_by: opts.personId,
        });
      }
      bag.bank_commitments.push({
        id: randomUUID(),
        bank_entry_id: opts.bankEntryId,
        person_id: opts.personId,
        roadmap_stage_id: opts.caseId ? roadmapStageId : null,
        created_at: nowIso(),
      });
    });
  } else {
    const sb = getServiceSupabase();
    if (opts.caseId) {
      const { data, error } = await sb
        .from("roadmap_stages")
        .insert({
          person_id: opts.personId,
          case_id: opts.caseId,
          stage,
          required: false,
          created_by: opts.personId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`markBankDoThis.roadmap: ${error.message}`);
      roadmapStageId = String(data.id);
    }
    const { error: cErr } = await sb.from("bank_commitments").upsert(
      {
        bank_entry_id: opts.bankEntryId,
        person_id: opts.personId,
        roadmap_stage_id: opts.caseId ? roadmapStageId : null,
      },
      { onConflict: "bank_entry_id,person_id" },
    );
    if (cErr) throw new Error(`markBankDoThis.commit: ${cErr.message}`);
  }

  await logActivity({
    person_id: opts.personId,
    action: "bank_do_this",
    target: opts.bankEntryId,
    meta: { lesson: entry.lesson, roadmapStageId },
  });

  return { ok: true, roadmapStageId };
}

/** Suggest transcript-based ideas for F-276 from lines that look like claims. */
export function suggestIdeasFromTranscript(
  lines: TranscriptLine[],
): { text: string; lineId: string }[] {
  const out: { text: string; lineId: string }[] = [];
  for (const l of lines) {
    const t = l.text.trim();
    if (t.length < 40) continue;
    if (
      /thesis|claim|because|principle|stakeholder|framework|we should|ought/i.test(
        t,
      )
    ) {
      out.push({ text: t.slice(0, 280), lineId: l.id });
    }
    if (out.length >= 5) break;
  }
  return out;
}

export { SKILL_LABELS };

/** After a round, bump skills slightly and check stalls (F-278). */
export async function updateSkillsAfterRound(opts: {
  personId: string;
  caseId: string | null;
  improved: boolean;
}): Promise<SkillChart> {
  const prev = await getSkillChart(opts.personId);
  const base: SkillChart = prev ?? {
    person_id: opts.personId,
    skills: {
      answer_first: 5,
      explain_frameworks: 5,
      engage_objections: 5,
      stay_under_time: 5,
      commentary_focus: 5,
    },
    updated_at: nowIso(),
  };
  const skills = { ...base.skills };
  if (opts.improved) {
    skills.answer_first = Math.min(10, (skills.answer_first ?? 5) + 0.2);
    skills.engage_objections = Math.min(
      10,
      (skills.engage_objections ?? 5) + 0.1,
    );
  } else {
    // Flat update still records a snapshot for stall detection.
    skills.answer_first = skills.answer_first ?? 5;
  }
  const next = { ...base, skills, updated_at: nowIso() };
  await saveSkillChart(next);
  await applySkillStallRoadmapTasks({
    personId: opts.personId,
    caseId: opts.caseId,
    chart: next,
  });
  return next;
}
