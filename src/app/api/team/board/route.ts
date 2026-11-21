import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listTeams, getPersonById, listPeopleFull } from "@/lib/db/repository";
import {
  listCases,
  listChats,
  listMessages,
  teamBoardSnapshot,
} from "@/lib/team/repository";
import { teamChannel } from "@/lib/team/channels";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const teamId =
    url.searchParams.get("teamId") ??
    session.teamId ??
    (await listTeams())[0]?.id;
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }

  const [board, teams, cases, person, people, chats] = await Promise.all([
    teamBoardSnapshot(teamId),
    listTeams(),
    listCases(),
    getPersonById(session.personId),
    listPeopleFull(),
    listChats(),
  ]);

  const channel = teamChannel(teamId);
  const chat = chats.find((c) => c.channel === channel) ?? null;
  const messages = chat ? await listMessages(chat.id) : [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  return NextResponse.json({
    teamId,
    teams,
    cases,
    board,
    chat: chat
      ? {
          id: chat.id,
          channel: chat.channel,
          messages: messages.map((m) => ({
            ...m,
            person_name: m.person_id ? nameById.get(m.person_id) ?? null : null,
          })),
        }
      : null,
    me: {
      id: session.personId,
      name: session.name,
      teamId: session.teamId,
      role: session.role,
    },
    personName: person?.name,
  });
}
