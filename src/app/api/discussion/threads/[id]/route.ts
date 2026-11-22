import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listPeopleFull } from "@/lib/db/repository";
import {
  canWriteDiscussion,
  isDiscussionAdmin,
} from "@/lib/discussion/access";
import {
  addReply,
  getThreadById,
  listReplies,
} from "@/lib/discussion/repository";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const thread = await getThreadById(id);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const own = person.team_id ?? session.teamId;
  if (
    !isDiscussionAdmin(person, session) &&
    thread.team_id !== own
  ) {
    return NextResponse.json(
      { error: "You can only see your own team's discussion." },
      { status: 403 },
    );
  }

  const replies = await listReplies(id);
  const people = (await listPeopleFull())
    .filter((p) => p.team_id === thread.team_id)
    .map((p) => ({ id: p.id, name: p.name }));

  return NextResponse.json({
    thread,
    replies,
    people,
    canWrite: canWriteDiscussion(person, session, thread.team_id),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unknown person" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const thread = await getThreadById(id);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  if (!canWriteDiscussion(person, session, thread.team_id)) {
    return NextResponse.json(
      { error: "You can only discuss on your own team." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    body?: string;
    mentionIds?: string[];
  };
  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
  }

  try {
    const reply = await addReply({
      threadId: id,
      personId: person.id,
      body: body.body,
      mentionIds: body.mentionIds,
    });
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save reply." },
      { status: 400 },
    );
  }
}
