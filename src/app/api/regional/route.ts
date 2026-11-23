import { NextResponse } from "next/server";
import {
  canWriteTeamData,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  getCompetitionDayHub,
  logRealRound,
  saveDayRound,
  saveDebrief,
  saveLogistics,
} from "@/lib/regional/service";
import type { DayRoundSpeaker } from "@/lib/db/supabase/regional-extra";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }
  const hub = await getCompetitionDayHub({
    personId: session.personId,
    teamId: session.teamId ?? person.team_id,
    role: person.role,
  });
  return NextResponse.json(hub);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action?: string;
    competitionId?: string;
    teamId?: string;
    schedule_text?: string | null;
    departure_time?: string | null;
    meeting_point?: string | null;
    dress_guidance?: string | null;
    venue_notes?: string | null;
    room_notes?: string | null;
    packing_list?: string | null;
    carpool_list?: string | null;
    roundNumber?: number;
    caseId?: string | null;
    caseLabel?: string | null;
    side?: "presenting" | "commenting" | null;
    speakers?: DayRoundSpeaker[];
    keyPoints?: string[];
    room?: string | null;
    startsAt?: string | null;
    opponent?: string;
    caseNumber?: number | null;
    moderatorQuestion?: string | null;
    judgesQuestions?: string | null;
    judgeComments?: string | null;
    scoreUs?: number | null;
    scoreThem?: number | null;
    result?: "win" | "loss" | "tie" | "pending" | null;
    debriefWorked?: string | null;
    debriefChange?: string | null;
    dayRoundId?: string | null;
    logId?: string;
  };

  const competitionId = body.competitionId;
  const resolved = resolveVisibleTeamId({
    person,
    session,
    requested: body.teamId,
  });
  if (resolved.denied) {
    return NextResponse.json(
      { error: "You can only change your own team's Competition Day." },
      { status: 403 },
    );
  }
  const teamId = resolved.teamId;

  try {
    switch (body.action) {
      case "save_logistics": {
        if (!competitionId) {
          return NextResponse.json(
            { error: "Missing competition." },
            { status: 400 },
          );
        }
        const logistics = await saveLogistics({
          competitionId,
          personId: session.personId,
          role: person.role,
          patch: {
            schedule_text: body.schedule_text,
            departure_time: body.departure_time,
            meeting_point: body.meeting_point,
            dress_guidance: body.dress_guidance,
            venue_notes: body.venue_notes,
            room_notes: body.room_notes,
            packing_list: body.packing_list,
            carpool_list: body.carpool_list,
          },
        });
        return NextResponse.json({ logistics });
      }
      case "save_round": {
        if (!competitionId || !teamId || !body.roundNumber) {
          return NextResponse.json(
            { error: "Need a team and round number." },
            { status: 400 },
          );
        }
        if (!canWriteTeamData(person, session, teamId)) {
          return NextResponse.json(
            { error: "You can only save your own team's round card." },
            { status: 403 },
          );
        }
        const round = await saveDayRound({
          competitionId,
          teamId,
          personId: session.personId,
          role: person.role,
          roundNumber: body.roundNumber,
          caseId: body.caseId,
          caseLabel: body.caseLabel,
          side: body.side,
          speakers: body.speakers,
          keyPoints: body.keyPoints,
          room: body.room,
          startsAt: body.startsAt,
        });
        return NextResponse.json({ round });
      }
      case "log_round": {
        if (!competitionId || !teamId) {
          return NextResponse.json(
            { error: "Need a team and competition." },
            { status: 400 },
          );
        }
        if (!canWriteTeamData(person, session, teamId)) {
          return NextResponse.json(
            { error: "You can only log rounds for your own team." },
            { status: 403 },
          );
        }
        const entry = await logRealRound({
          competitionId,
          teamId,
          personId: session.personId,
          opponent: body.opponent ?? "",
          caseId: body.caseId,
          caseNumber: body.caseNumber,
          roundNumber: body.roundNumber,
          side: body.side,
          moderatorQuestion: body.moderatorQuestion,
          judgesQuestions: body.judgesQuestions,
          judgeComments: body.judgeComments,
          scoreUs: body.scoreUs,
          scoreThem: body.scoreThem,
          result: body.result,
          debriefWorked: body.debriefWorked,
          debriefChange: body.debriefChange,
          dayRoundId: body.dayRoundId,
        });
        return NextResponse.json({ entry });
      }
      case "save_debrief": {
        if (!body.logId) {
          return NextResponse.json(
            { error: "Missing round log." },
            { status: 400 },
          );
        }
        const entry = await saveDebrief({
          logId: body.logId,
          personId: session.personId,
          person,
          session,
          debriefWorked: body.debriefWorked ?? "",
          debriefChange: body.debriefChange ?? "",
        });
        return NextResponse.json({ entry });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update Competition Day.";
    const status =
      message.includes("another team") || message.includes("own team")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
