import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listChats,
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
  const chatId = new URL(req.url).searchParams.get("chatId");
  const chats = await listChats();
  if (!chatId) {
    return NextResponse.json({ chats });
  }
  const messages = await listMessages(chatId);
  return NextResponse.json({ chats, messages });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    chatId?: string;
    message?: string;
    mentionIds?: string[];
    caseId?: string | null;
    isIdea?: boolean;
    markIdeaId?: string;
  };

  if (body.markIdeaId) {
    const msg = await markMessageIdea(body.markIdeaId, session.personId);
    return NextResponse.json({ message: msg });
  }

  if (!body.chatId || !body.message?.trim()) {
    return NextResponse.json({ error: "Missing chatId or message" }, { status: 400 });
  }

  try {
    const message = await postMessage({
      chatId: body.chatId,
      personId: session.personId,
      body: body.message.trim(),
      mentionIds: body.mentionIds,
      caseId: body.caseId,
      isIdea: body.isIdea,
      actorTeamId: session.teamId,
      actorRole: session.adminView ? session.role : "member",
    });
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 403 },
    );
  }
}
