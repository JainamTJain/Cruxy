import {
  getProgramTotals,
  listPeopleFull,
  listReadiness,
  listTeams,
  listCases,
  listActivityLog,
} from "@/lib/db/repository";
import { listDriftFlags, teamBoardSnapshot } from "@/lib/team/repository";
import { callCruxy } from "@/lib/cruxy/callCruxy";

export type ProgramAnswer = {
  text: string;
  numbers: string[];
  missing: string[];
  links: { label: string; href: string }[];
  stub: boolean;
};

function weekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

async function loadAttendanceSummary(): Promise<
  { person_id: string; name: string; sessions: number; present: number }[]
> {
  const { isSampleDataMode } = await import("@/lib/db/config");
  if (isSampleDataMode()) {
    const { readStore } = await import("@/lib/db/sample-store");
    const store = await readStore();
    const byPerson = new Map<
      string,
      { person_id: string; name: string; sessions: number; present: number }
    >();
    for (const row of store.attendance) {
      const person = store.people.find((p) => p.id === row.person_id);
      if (!person) continue;
      const cur = byPerson.get(person.id) ?? {
        person_id: person.id,
        name: person.name,
        sessions: 0,
        present: 0,
      };
      cur.sessions += 1;
      if (row.status === "present" || row.status === "late") cur.present += 1;
      byPerson.set(person.id, cur);
    }
    return [...byPerson.values()].filter((a) => a.sessions > 0);
  }
  const { attendanceForWeeklySummary } = await import("@/lib/attendance");
  return attendanceForWeeklySummary();
}

/**
 * Admin-only program brief (F-179 to F-183). Answers only from Crux records.
 * Shows the numbers used and names missing data. Members cannot call this.
 */
export async function answerProgramQuestion(input: {
  question: string;
  personId: string;
}): Promise<ProgramAnswer> {
  const q = input.question.toLowerCase();
  const [teams, cases, readiness, people, totals, activity] = await Promise.all(
    [
      listTeams(),
      listCases(),
      listReadiness(),
      listPeopleFull(),
      getProgramTotals(),
      listActivityLog(120),
    ],
  );
  const attendance = await loadAttendanceSummary();

  const active = cases.filter((c) => c.active);
  const numbers: string[] = [
    `teams=${teams.length}`,
    `active_cases=${active.length}`,
    `people=${people.length}`,
    `rounds_graded=${totals.rounds_graded ?? 0}`,
  ];
  const missing: string[] = [];

  if (!readiness.length) missing.push("readiness cells");
  if (!activity.length) missing.push("activity this week");
  if (!attendance.length) missing.push("attendance rows");

  const since = weekAgoIso();
  const weekActs = activity.filter((a) => a.at >= since);
  numbers.push(`activity_this_week=${weekActs.length}`);

  const byTeamActs = teams.map((t) => {
    const memberIds = new Set(
      people.filter((p) => p.team_id === t.id).map((p) => p.id),
    );
    const n = weekActs.filter(
      (a) => a.person_id && memberIds.has(a.person_id),
    ).length;
    return `${t.name}: ${n} logged actions`;
  });

  const low = readiness
    .filter((r) => r.readiness_pct < 40)
    .map((r) => {
      const team = teams.find((t) => t.id === r.team_id)?.name ?? "?";
      const cas = cases.find((c) => c.id === r.case_id);
      return `${team} Case ${cas?.number ?? "?"}: ${r.readiness_pct}% (${r.lead_names.join(", ") || "no leads named"})`;
    });
  numbers.push(`low_readiness_cells=${low.length}`);

  const gapLines: string[] = [];
  for (const t of teams) {
    const board = await teamBoardSnapshot(t.id);
    for (const row of board.cases) {
      const hasLead = board.roles.some(
        (r) => r.case_id === row.case.id && r.role === "lead_1",
      );
      if (!hasLead) {
        gapLines.push(`${t.name}: Case ${row.case.number} has no Lead 1`);
      }
      const map = row.current;
      if (map) {
        const unanswered = map.body.claims.filter(
          (c) => !c.counterclaim_response?.trim(),
        );
        if (unanswered.length) {
          gapLines.push(
            `${t.name}: Case ${row.case.number} has ${unanswered.length} claim(s) without a counterclaim answer`,
          );
        }
      }
    }
    const drifts = await listDriftFlags(t.id);
    const open = drifts.filter((d) => !d.resolved_at);
    if (open.length) {
      gapLines.push(`${t.name}: ${open.length} open drift flag(s)`);
      numbers.push(`${t.name}_drift=${open.length}`);
    }
  }
  numbers.push(`role_gaps=${gapLines.filter((g) => /no Lead 1/.test(g)).length}`);

  const behindRoadmap = people
    .filter((p) => p.team_id)
    .map((p) => {
      const cell = readiness.filter((r) =>
        r.lead_names.some((n) => n === p.name),
      );
      const avg =
        cell.length === 0
          ? null
          : Math.round(
              cell.reduce((s, r) => s + r.readiness_pct, 0) / cell.length,
            );
      return { name: p.name, avg };
    })
    .filter((x) => x.avg != null && (x.avg as number) < 50);

  const attLines = attendance.map(
    (a) => `${a.name}: ${a.present}/${a.sessions} sessions present`,
  );
  numbers.push(`attendance_people=${attendance.length}`);

  let focus =
    "Summarize what the records show. Prefer risks first. Never invent scores.";
  if (/this week|what did the teams|what changed|sessions ran/i.test(q)) {
    focus =
      "Answer what teams did this week, which sessions ran, and what changed, using only the activity and attendance numbers below.";
  } else if (/ready|prepared|practis|practic|roadmap|behind/i.test(q)) {
    focus =
      "Answer who is prepared or behind against their own path. Never use a fixed cutoff as a ranking against other people; report each person's own history.";
  } else if (/weakest|disagree|help|gap|counterclaim/i.test(q)) {
    focus =
      "Name the gap, the people involved, and one next step (session, drill, or pairing).";
  } else if (/brief|dec 5|december|competition|readiness brief/i.test(q)) {
    focus =
      "Return a one-page readiness brief by team and case, risks first, for the upcoming competition.";
  }

  const context = [
    `Focus: ${focus}`,
    `Program totals: ${JSON.stringify(totals)}`,
    `Activity this week by team: ${byTeamActs.join("; ") || "none logged"}`,
    `Attendance: ${attLines.join("; ") || "none"}`,
    `Low readiness (own-path %): ${low.slice(0, 12).join(" | ") || "none"}`,
    `People behind their own path (<50% on cells they lead): ${
      behindRoadmap.map((b) => `${b.name} ~${b.avg}%`).join(", ") || "none named"
    }`,
    `Gaps and open risks: ${gapLines.slice(0, 20).join(" | ") || "none"}`,
    `Missing data: ${missing.join(", ") || "none noted"}`,
    `Numbers used: ${numbers.join(", ")}`,
  ].join("\n");

  const links = [
    { label: "Program map", href: "/home" },
    { label: "Team board", href: "/team" },
    { label: "Admin", href: "/admin" },
  ];

  const result = await callCruxy({
    feature: "admin_program",
    tier: "small",
    personId: input.personId,
    messages: [
      {
        role: "system",
        content:
          "You are Cruxy in admin mode. Answer only from the Crux records provided. Show the numbers you used. Say clearly when data is missing. Never invent attendance, scores, or chat. Prefer short, plain words. Never use the words AI or a model name.",
      },
      {
        role: "user",
        content: `Records:\n${context}\n\nQuestion: ${input.question}`,
      },
    ],
  });

  const groundedBits = [
    low[0] ? `Risk first: ${low[0]}.` : "No low-readiness cells on record.",
    gapLines[0] ? `Gap: ${gapLines[0]}.` : null,
    missing.length ? `Missing: ${missing.join(", ")}.` : null,
    `Numbers used: ${numbers.slice(0, 6).join(", ")}.`,
  ].filter(Boolean);

  if (!result.ok) {
    return {
      text: `${result.reason}\n\n${groundedBits.join(" ")}`,
      numbers,
      missing,
      links,
      stub: true,
    };
  }

  return {
    text: `${result.text}\n\n${groundedBits.join(" ")}`,
    numbers,
    missing,
    links,
    stub: result.stub,
  };
}

export { buildReadAloudScript } from "@/lib/team/read-aloud";