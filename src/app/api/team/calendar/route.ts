import { NextResponse } from "next/server";
import { canManageTeamCalendar } from "@/lib/auth/capabilities";
import { isAdminRole } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listTeams } from "@/lib/db/repository";
import {
  createPoll,
  createTeamEvent,
  ensureCalendarToken,
  listPolls,
  listTeamCalendar,
  lockPollToEvent,
  rotateCalendarToken,
  votePoll,
} from "@/lib/team/calendar-repository";
import type { TeamEventKind } from "@/lib/team/calendar-types";
import { listCaseRoles } from "@/lib/team/repository";

export const runtime = "nodejs";

function resolveTeamId(
  person: { team_id: string | null },
  session: { teamId: string | null; adminView: boolean; role: string },
  requested: string | null,
): string | null {
  if (
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin") &&
    requested
  ) {
    return requested;
  }
  return person.team_id ?? session.teamId ?? requested;
}

async function isLeadOnTeam(personId: string, teamId: string): Promise<boolean> {
  const roles = await listCaseRoles(teamId);
  return roles.some(
    (r) =>
      r.person_id === personId &&
      (r.role === "lead_1" || r.role === "lead_2"),
  );
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const teamId = resolveTeamId(
    person,
    session,
    url.searchParams.get("teamId"),
  );
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }

  const [events, polls, token, lead] = await Promise.all([
    listTeamCalendar(teamId),
    listPolls(teamId),
    ensureCalendarToken(person.id),
    isLeadOnTeam(person.id, teamId),
  ]);
  const canManage = canManageTeamCalendar(person, session, teamId, lead);
  const teams =
    session.adminView && isAdminRole(person.role) ? await listTeams() : [];

  const origin = url.origin;
  return NextResponse.json({
    teamId,
    events,
    polls,
    canManage,
    canTakeAttendance:
      person.role === "tech_admin" || person.role === "coach_admin"
        ? session.adminView
        : false,
    subscribeUrl: `${origin}/api/calendar/feed/${token}.ics`,
    me: { id: person.id, name: person.name },
    teams: teams.map((t) => ({ id: t.id, name: t.name, colour: t.colour })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: string;
    teamId?: string;
    title?: string;
    kind?: TeamEventKind;
    startsAt?: string;
    endsAt?: string | null;
    place?: string | null;
    online?: boolean;
    body?: string | null;
    practiceSessionId?: string | null;
    slots?: { startsAt: string; endsAt?: string | null; label?: string }[];
    pollId?: string;
    slotIds?: string[];
    slotId?: string;
  };

  const teamId = resolveTeamId(person, session, body.teamId ?? null);
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }

  const lead = await isLeadOnTeam(person.id, teamId);
  const canManage = canManageTeamCalendar(person, session, teamId, lead);
  const action = body.action ?? "create_event";

  try {
    if (action === "rotate_token") {
      const token = await rotateCalendarToken(person.id);
      const origin = new URL(req.url).origin;
      return NextResponse.json({
        subscribeUrl: `${origin}/api/calendar/feed/${token}.ics`,
      });
    }

    if (action === "vote_poll") {
      if (!body.pollId || !body.slotIds) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      await votePoll({
        pollId: body.pollId,
        personId: person.id,
        slotIds: body.slotIds,
      });
      const polls = await listPolls(teamId);
      return NextResponse.json({ polls });
    }

    if (action === "create_event") {
      if (!canManage) {
        return NextResponse.json(
          { error: "Only Dr. B or a case lead can add events." },
          { status: 403 },
        );
      }
      if (!body.title?.trim() || !body.startsAt) {
        return NextResponse.json({ error: "Need a title and time" }, { status: 400 });
      }
      const event = await createTeamEvent({
        teamId,
        title: body.title,
        kind: body.kind ?? "practice",
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        place: body.place,
        online: body.online,
        body: body.body,
        practiceSessionId: body.practiceSessionId,
        actorId: person.id,
      });
      return NextResponse.json({ event });
    }

    if (action === "create_poll") {
      if (!canManage) {
        return NextResponse.json(
          { error: "Only Dr. B or a case lead can start a poll." },
          { status: 403 },
        );
      }
      const poll = await createPoll({
        teamId,
        title: body.title?.trim() || "When can you meet?",
        slots: body.slots ?? [],
        actorId: person.id,
      });
      return NextResponse.json({ poll });
    }

    if (action === "lock_poll") {
      if (!canManage) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
      if (!body.pollId || !body.slotId) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const result = await lockPollToEvent({
        pollId: body.pollId,
        slotId: body.slotId,
        actorId: person.id,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
