import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  changesSince,
  getLastVisit,
  getPersonById,
  getProgramTotals,
  listCases,
  listCompetitions,
  listPeopleFull,
  listReadiness,
  listTeams,
  recordLastVisit,
  teamReadinessAverages,
} from "@/lib/db/repository";
import { getRoadmapView } from "@/lib/revision/repository";
import { listAssignments } from "@/lib/team/repository";
import {
  countLibraryForProgramMap,
  ensureSampleLibraryBootstrapped,
} from "@/lib/db/supabase/library-extra";
import { latestSyncRun } from "@/lib/db/library-repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSampleLibraryBootstrapped(session.personId).catch(() => null);

  const person = await getPersonById(session.personId);
  const lastVisit = await getLastVisit(session.personId);
  const [
    teams,
    cases,
    readiness,
    totalsBase,
    competitions,
    people,
    avgs,
    changes,
    roadmap,
    assignments,
    libraryCounts,
    latestDriveSync,
  ] = await Promise.all([
    listTeams(),
    listCases(),
    listReadiness(),
    getProgramTotals(),
    listCompetitions(),
    listPeopleFull(),
    teamReadinessAverages(),
    changesSince(lastVisit, 15),
    getRoadmapView(session.personId).catch(() => null),
    listAssignments({ personId: session.personId }).catch(() => []),
    countLibraryForProgramMap().catch(() => ({
      drive_files: 0,
      passages: 0,
    })),
    latestSyncRun().catch(() => null),
  ]);

  const totals = {
    ...totalsBase,
    drive_files: Math.max(totalsBase.drive_files, libraryCounts.drive_files),
    passages_cited: Math.max(
      totalsBase.passages_cited,
      libraryCounts.passages,
    ),
  };

  await recordLastVisit(session.personId);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const nextCompetition = competitions[0] ?? null;
  const days = nextCompetition
    ? Math.ceil(
        (new Date(nextCompetition.date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  let cells = readiness;
  // When readiness_cells is empty, seed only this person's own team cells
  // from their roadmap. Other teams stay at 0 (empty), never a muted copy
  // of personal readiness (that leaked personal roadmap shape).
  if (cells.length === 0) {
    const active = cases.filter((c) => c.active);
    const ownTeam = person?.team_id ?? session.teamId;
    cells = [];
    for (const team of teams) {
      for (const c of active) {
        const own =
          roadmap?.cases.find((r) => r.case.id === c.id)?.readiness ?? 0;
        const pct =
          ownTeam && team.id === ownTeam ? own : 0;
        cells.push({
          id: `${team.id}-${c.id}`,
          team_id: team.id,
          case_id: c.id,
          readiness_pct: pct,
          lead_names: [],
          latest_event: null,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const nextActions: { label: string; detail: string; href: string }[] = [];

  for (const a of assignments.filter((x) => x.status === "open").slice(0, 3)) {
    const overdue = Boolean(a.due && a.due < today);
    nextActions.push({
      label: overdue ? "OVERDUE" : a.case_id ? "ASSIGNED" : "TASK",
      detail: a.task,
      href: a.case_id ? `/case-brain/${a.case_id}` : "/revision/roadmap",
    });
  }

  if (roadmap?.doNext?.length) {
    for (const d of roadmap.doNext) {
      if (nextActions.length >= 3) break;
      nextActions.push({
        label: /overdue/i.test(d) ? "OVERDUE" : "DO NEXT",
        detail: d,
        href: "/revision/roadmap",
      });
    }
  }

  const fillers = [
    {
      label: "FLASHCARDS",
      detail: "Review due cards against your own recall history",
      href: "/revision/flashcards",
    },
    {
      label: "READING",
      detail: "Open one Drive file in the reading room",
      href: "/library",
    },
    {
      label: "WARM-UP",
      detail: "Build a 10-minute warm-up for competition morning",
      href: "/revision/warmup",
    },
  ];
  while (nextActions.length < 3) {
    nextActions.push(fillers[nextActions.length]!);
  }

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const { listTodaySessionsForPerson, listRecentMemberPractices } = await import(
    "@/lib/practice/wave5"
  );
  const todaySessions = await listTodaySessionsForPerson({
    personId: session.personId,
    teamId: session.teamId,
  });
  const memberPractices =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin")
      ? await listRecentMemberPractices(8)
      : [];

  // Prefer joining today's practice over filler next-actions.
  for (const s of todaySessions.slice(0, 2)) {
    nextActions.unshift({
      label: s.invitePending ? "INVITE" : "JOIN",
      detail: s.invitePending
        ? `Accept invite: ${s.title}`
        : `Join ${s.title}${s.caseNumber != null ? ` (Case ${s.caseNumber})` : ""}`,
      href: s.invitePending
        ? `/practice/sessions/${s.sessionId}`
        : s.href,
    });
  }

  return NextResponse.json({
    teams,
    cases: cases.filter((c) => c.active),
    readiness: cells,
    totals,
    deltas: {
      bank_questions:
        totals.bank_questions > 0
          ? `${totals.bank_questions} in the bank`
          : undefined,
      sources_verified:
        totals.sources_verified > 0
          ? `${totals.sources_verified} verified`
          : undefined,
      ideas_accepted:
        totals.ideas_accepted > 0
          ? `${totals.ideas_accepted} accepted`
          : undefined,
      drive_files:
        totals.drive_files > 0
          ? `${totals.drive_files} digested`
          : undefined,
    },
    driveStatus: {
      synced: totals.drive_files > 0 || Boolean(latestDriveSync?.finished_at),
      fileCount: totals.drive_files,
      lastSyncAt: latestDriveSync?.finished_at ?? null,
      canSync: session.role === "tech_admin",
    },
    teamAverages: avgs,
    competition: nextCompetition,
    daysToCompetition: days == null ? null : Math.max(0, days),
    changes: changes.map((e) => ({
      ...e,
      personName: e.person_id ? names.get(e.person_id) ?? "unknown" : "system",
    })),
    nextActions: nextActions.slice(0, 3),
    lastVisit,
    todayLabel,
    todaySessions,
    memberPractices,
  });
}
