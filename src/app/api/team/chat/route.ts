import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  listConversationsForPerson,
  markChatRead,
  notifyMentions,
} from "@/lib/team/chat-conversations";
import {
  listMessages,
  markMessageIdea,
  postMessage,
} from "@/lib/team/repository";

export const runtime = "nodejs";

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
  const chatId = url.searchParams.get("chatId");
  const isAdmin =
    person.role === "tech_admin" || person.role === "coach_admin";

  const payload = await listConversationsForPerson({
    personId: person.id,
    teamId: person.team_id ?? session.teamId,
    isAdmin: isAdmin || session.adminView,
  });

  if (!chatId) {
    return NextResponse.json({
      conversations: payload.conversations,
      chats: payload.conversations,
      people: payload.people,
      cases: payload.cases,
      meId: payload.meId,
    });
  }

  const messages = await listMessages(chatId);
  await markChatRead({ personId: person.id, chatId });

  // Refresh unread after mark
  const refreshed = await listConversationsForPerson({
    personId: person.id,
    teamId: person.team_id ?? session.teamId,
    isAdmin: isAdmin || session.adminView,
  });

  return NextResponse.json({
    conversations: refreshed.conversations,
    chats: refreshed.conversations,
    messages,
    people: refreshed.people,
    cases: refreshed.cases,
    meId: refreshed.meId,
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
    chatId?: string;
    message?: string;
    mentionIds?: string[];
    caseId?: string | null;
    isIdea?: boolean;
    markIdeaId?: string;
    markReadId?: string;
    linkRefs?: Record<string, unknown> | null;
    truthSourceId?: string | null;
    passageRef?: string | null;
    timestampRef?: string | null;
  };

  if (body.markReadId) {
    await markChatRead({
      personId: session.personId,
      chatId: body.markReadId,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.markIdeaId) {
    const msg = await markMessageIdea(body.markIdeaId, session.personId);
    return NextResponse.json({ message: msg });
  }

  if (!body.chatId || !body.message?.trim()) {
    return NextResponse.json(
      { error: "Missing chatId or message" },
      { status: 400 },
    );
  }

  const linkRefs: Record<string, unknown> = { ...(body.linkRefs ?? {}) };
  if (body.truthSourceId) linkRefs.truth_source_id = body.truthSourceId;
  if (body.passageRef) linkRefs.passage = body.passageRef;
  if (body.timestampRef) linkRefs.timestamp = body.timestampRef;

  try {
    const message = await postMessage({
      chatId: body.chatId,
      personId: session.personId,
      body: body.message.trim(),
      mentionIds: body.mentionIds,
      caseId: body.caseId,
      isIdea: body.isIdea,
      linkRefs: Object.keys(linkRefs).length ? linkRefs : null,
      actorTeamId: session.teamId,
      actorRole: session.adminView ? session.role : "member",
    });

    const isAdmin =
      person.role === "tech_admin" || person.role === "coach_admin";
    const payload = await listConversationsForPerson({
      personId: person.id,
      teamId: person.team_id ?? session.teamId,
      isAdmin: isAdmin || session.adminView,
    });
    const convo = payload.conversations.find((c) => c.id === body.chatId);
    const notified = await notifyMentions({
      message,
      actorId: person.id,
      actorName: person.name,
      chatTitle: convo?.title ?? "Team chat",
    });

    // Store who was notified on the message link_refs for display
    if (notified.length && message.link_refs) {
      message.link_refs = {
        ...message.link_refs,
        notified,
      };
    } else if (notified.length) {
      message.link_refs = { notified };
    }

    await markChatRead({
      personId: session.personId,
      chatId: body.chatId,
    });

    return NextResponse.json({
      message,
      notified,
      notifiedNames: notified
        .map((id) => payload.people.find((p) => p.id === id)?.name)
        .filter(Boolean),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 403 },
    );
  }
}
