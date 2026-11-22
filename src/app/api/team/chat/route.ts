import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isSampleDataMode } from "@/lib/db/config";
import { getPersonById } from "@/lib/db/repository";
import { updateStore } from "@/lib/db/sample-store";
import {
  getMessageChatId,
  listConversationsForPerson,
  markChatRead,
  mentionablePersonIds,
  notifyMentions,
  personCanAccessChat,
} from "@/lib/team/chat-conversations";
import {
  listMessages,
  markMessageIdea,
  postMessage,
} from "@/lib/team/repository";

export const runtime = "nodejs";

async function persistMessageMentions(
  messageId: string,
  mentionIds: string[],
): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const msg = s.messages.find((m) => m.id === messageId);
      if (msg) msg.mention_ids = mentionIds;
    });
    return;
  }
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    await getServiceSupabase()
      .from("messages")
      .update({ mention_ids: mentionIds })
      .eq("id", messageId);
  } catch {
    // ignore
  }
}

function isAdminPerson(
  person: { role: string },
  session: { adminView: boolean },
): boolean {
  return (
    (person.role === "tech_admin" || person.role === "coach_admin") &&
    session.adminView
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
  const chatId = url.searchParams.get("chatId");
  const admin = isAdminPerson(person, session);
  const teamId = person.team_id ?? session.teamId;

  const payload = await listConversationsForPerson({
    personId: person.id,
    teamId,
    isAdmin: admin,
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

  if (!payload.conversations.some((c) => c.id === chatId)) {
    return NextResponse.json(
      { error: "You cannot open this conversation." },
      { status: 403 },
    );
  }

  const messages = await listMessages(chatId);
  await markChatRead({ personId: person.id, chatId });

  // Refresh unread after mark
  const refreshed = await listConversationsForPerson({
    personId: person.id,
    teamId,
    isAdmin: admin,
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

  const admin = isAdminPerson(person, session);
  const teamId = person.team_id ?? session.teamId;

  if (body.markReadId) {
    const ok = await personCanAccessChat({
      personId: person.id,
      teamId,
      isAdmin: admin,
      chatId: body.markReadId,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "You cannot open this conversation." },
        { status: 403 },
      );
    }
    await markChatRead({
      personId: session.personId,
      chatId: body.markReadId,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.markIdeaId) {
    // Resolve the message's chat first so we never mutate a hidden thread
    const chatIdForIdea = await getMessageChatId(body.markIdeaId);
    if (!chatIdForIdea) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    const ok = await personCanAccessChat({
      personId: person.id,
      teamId,
      isAdmin: admin,
      chatId: chatIdForIdea,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "You cannot open this conversation." },
        { status: 403 },
      );
    }
    const msg = await markMessageIdea(body.markIdeaId, session.personId);
    return NextResponse.json({ message: msg });
  }

  if (!body.chatId || !body.message?.trim()) {
    return NextResponse.json(
      { error: "Missing chatId or message" },
      { status: 400 },
    );
  }

  const canPost = await personCanAccessChat({
    personId: person.id,
    teamId,
    isAdmin: admin,
    chatId: body.chatId,
  });
  if (!canPost) {
    return NextResponse.json(
      { error: "You cannot post in this conversation." },
      { status: 403 },
    );
  }

  const allowedMentions = await mentionablePersonIds({
    chatId: body.chatId,
    teamId,
    isAdmin: admin,
    actorId: person.id,
  });
  const mentionIds = (body.mentionIds ?? []).filter((id) =>
    allowedMentions.has(id),
  );

  const linkRefs: Record<string, unknown> = { ...(body.linkRefs ?? {}) };
  if (body.truthSourceId) linkRefs.truth_source_id = body.truthSourceId;
  if (body.passageRef) linkRefs.passage = body.passageRef;
  if (body.timestampRef) linkRefs.timestamp = body.timestampRef;

  try {
    const message = await postMessage({
      chatId: body.chatId,
      personId: session.personId,
      body: body.message.trim(),
      mentionIds,
      caseId: body.caseId,
      isIdea: body.isIdea,
      linkRefs: Object.keys(linkRefs).length ? linkRefs : null,
      actorTeamId: session.teamId,
      actorRole: session.adminView ? session.role : "member",
    });

    // Drop any @Name resolves that are outside the conversation audience
    const safeMentions = message.mention_ids.filter((id) =>
      allowedMentions.has(id),
    );
    if (safeMentions.length !== message.mention_ids.length) {
      message.mention_ids = safeMentions;
      await persistMessageMentions(message.id, safeMentions);
    }

    const payload = await listConversationsForPerson({
      personId: person.id,
      teamId,
      isAdmin: admin,
    });
    const convo = payload.conversations.find((c) => c.id === body.chatId);
    const notified = await notifyMentions({
      message,
      actorId: person.id,
      actorName: person.name,
      chatTitle: convo?.title ?? "Team chat",
      allowedPersonIds: allowedMentions,
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
