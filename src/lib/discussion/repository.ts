/**
 * Workstream E: discussion threads on the case (sample + Supabase).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import {
  getPersonById,
  listPeopleFull,
  logActivity,
} from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { ensureCaseConversation } from "@/lib/team/chat-conversations";
import { getCaseById } from "@/lib/team/repository";
import { nowIso } from "@/lib/utils";
import type {
  DiscussionReply,
  DiscussionThread,
  DiscussionThreadKind,
} from "@/lib/discussion/types";
import { discussionHref } from "@/lib/discussion/types";

type ThreadRow = {
  id: string;
  team_id: string;
  case_id: string;
  kind: DiscussionThreadKind;
  target_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ReplyRow = {
  id: string;
  thread_id: string;
  person_id: string | null;
  author?: "person" | "cruxy";
  body: string;
  mention_ids: string[];
  created_at: string;
};

type VisitRow = {
  person_id: string;
  team_id: string;
  case_id: string;
  last_seen_at: string;
};

type StoreBag = {
  discussion_threads?: ThreadRow[];
  discussion_replies?: ReplyRow[];
  discussion_visits?: VisitRow[];
};

const KINDS = new Set<DiscussionThreadKind>([
  "annotation",
  "suggestion",
  "one_pager_field",
  "general",
]);

export function isDiscussionKind(v: unknown): v is DiscussionThreadKind {
  return typeof v === "string" && KINDS.has(v as DiscussionThreadKind);
}

async function resolveMentionIds(
  body: string,
  explicit?: string[],
): Promise<string[]> {
  const ids = [...(explicit ?? [])];
  const people = await listPeopleFull();
  const lower = body.toLowerCase();
  for (const p of people) {
    const needle = `@${p.name}`.toLowerCase();
    if (lower.includes(needle) && !ids.includes(p.id)) ids.push(p.id);
  }
  return ids;
}

async function notifyMentions(input: {
  mentionIds: string[];
  fromPersonId: string;
  body: string;
  href: string;
  threadId: string;
}): Promise<void> {
  const targets = input.mentionIds.filter((id) => id && id !== input.fromPersonId);
  if (!targets.length) return;
  const from = await getPersonById(input.fromPersonId);
  const fromName = from?.name ?? "Someone";
  const snippet =
    input.body.length > 120 ? `${input.body.slice(0, 117)}...` : input.body;
  for (const personId of targets) {
    await createNotification({
      personId,
      kind: "discussion_mention",
      title: `${fromName} mentioned you`,
      body: snippet,
      href: input.href,
      createdBy: input.fromPersonId,
      payload: { threadId: input.threadId },
    });
  }
}

function enrichThread(
  t: ThreadRow,
  replies: ReplyRow[],
): DiscussionThread {
  const mine = replies
    .filter((r) => r.thread_id === t.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = mine[mine.length - 1];
  return {
    ...t,
    reply_count: mine.length,
    last_reply_at: last?.created_at ?? null,
    last_body_preview: last
      ? last.body.length > 100
        ? `${last.body.slice(0, 97)}...`
        : last.body
      : null,
  };
}

async function listRepliesForThreads(
  threadIds: string[],
): Promise<ReplyRow[]> {
  if (!threadIds.length) return [];
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = (store as StoreBag).discussion_replies ?? [];
    return bag.filter((r) => threadIds.includes(r.thread_id));
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data, error } = await getServiceSupabase()
    .from("discussion_replies")
    .select("*")
    .in("thread_id", threadIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReplyRow[]).map((r) => ({
    ...r,
    mention_ids: r.mention_ids ?? [],
  }));
}

export async function listThreadsForCase(input: {
  teamId: string;
  caseId: string;
}): Promise<DiscussionThread[]> {
  let rows: ThreadRow[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    rows = ((store as StoreBag).discussion_threads ?? []).filter(
      (t) => t.team_id === input.teamId && t.case_id === input.caseId,
    );
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data, error } = await getServiceSupabase()
      .from("discussion_threads")
      .select("*")
      .eq("team_id", input.teamId)
      .eq("case_id", input.caseId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as ThreadRow[];
  }

  // Ensure a general thread exists for the case.
  if (!rows.some((t) => t.kind === "general")) {
    const general = await ensureThread({
      teamId: input.teamId,
      caseId: input.caseId,
      kind: "general",
      targetId: "general",
      title: "General",
      personId: null,
    });
    rows = [general, ...rows.filter((t) => t.id !== general.id)];
  }

  const replies = await listRepliesForThreads(rows.map((r) => r.id));
  return rows
    .map((t) => enrichThread(t, replies))
    .sort((a, b) => {
      const at = a.last_reply_at ?? a.updated_at;
      const bt = b.last_reply_at ?? b.updated_at;
      return bt.localeCompare(at);
    });
}

export async function getThreadById(
  threadId: string,
): Promise<ThreadRow | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (
      ((store as StoreBag).discussion_threads ?? []).find(
        (t) => t.id === threadId,
      ) ?? null
    );
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data, error } = await getServiceSupabase()
    .from("discussion_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ThreadRow | null) ?? null;
}

export async function ensureThread(input: {
  teamId: string;
  caseId: string;
  kind: DiscussionThreadKind;
  targetId: string;
  title: string;
  personId: string | null;
}): Promise<ThreadRow> {
  const title = input.title.trim().slice(0, 160) || defaultTitle(input.kind);

  if (isSampleDataMode()) {
    let found: ThreadRow | undefined;
    await updateStore((s) => {
      const bag = ((s as StoreBag).discussion_threads ??= []);
      found = bag.find(
        (t) =>
          t.team_id === input.teamId &&
          t.case_id === input.caseId &&
          t.kind === input.kind &&
          t.target_id === input.targetId,
      );
      if (found) {
        if (title && !found.title) found.title = title;
        return;
      }
      found = {
        id: randomUUID(),
        team_id: input.teamId,
        case_id: input.caseId,
        kind: input.kind,
        target_id: input.targetId,
        title,
        created_by: input.personId,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      bag.push(found);
    });
    await maybeEnsureCaseChat(input.teamId, input.caseId);
    return found!;
  }

  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("discussion_threads")
    .select("*")
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId)
    .eq("kind", input.kind)
    .eq("target_id", input.targetId)
    .maybeSingle();
  if (existing) {
    await maybeEnsureCaseChat(input.teamId, input.caseId);
    return existing as ThreadRow;
  }
  const { data, error } = await sb
    .from("discussion_threads")
    .upsert(
      {
        team_id: input.teamId,
        case_id: input.caseId,
        kind: input.kind,
        target_id: input.targetId,
        title,
        created_by: input.personId,
      },
      { onConflict: "team_id,case_id,kind,target_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await maybeEnsureCaseChat(input.teamId, input.caseId);
  return data as ThreadRow;
}

function defaultTitle(kind: DiscussionThreadKind): string {
  if (kind === "annotation") return "Note on the case";
  if (kind === "suggestion") return "Suggestion";
  if (kind === "one_pager_field") return "One pager";
  return "General";
}

async function maybeEnsureCaseChat(
  teamId: string,
  caseId: string,
): Promise<void> {
  try {
    const caseRow = await getCaseById(caseId);
    await ensureCaseConversation({
      teamId,
      caseId,
      caseNumber: caseRow?.number ?? null,
      caseTitle: caseRow?.title ?? null,
    });
  } catch {
    // Chat ensure is best-effort; discussion still works.
  }
}

export async function listReplies(
  threadId: string,
): Promise<DiscussionReply[]> {
  let rows: ReplyRow[] = [];
  if (isSampleDataMode()) {
    const store = await readStore();
    rows = ((store as StoreBag).discussion_replies ?? [])
      .filter((r) => r.thread_id === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data, error } = await getServiceSupabase()
      .from("discussion_replies")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as ReplyRow[]).map((r) => ({
      ...r,
      mention_ids: r.mention_ids ?? [],
    }));
  }
  const people = await listPeopleFull();
  const names = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    thread_id: r.thread_id,
    person_id: r.person_id,
    author: r.author ?? "person",
    person_name: r.author === "cruxy" ? "Cruxy" : r.person_id ? names.get(r.person_id) ?? null : null,
    body: r.body,
    mention_ids: r.mention_ids,
    created_at: r.created_at,
  }));
}

export async function addReply(input: {
  threadId: string;
  personId: string;
  body: string;
  mentionIds?: string[];
}): Promise<DiscussionReply> {
  const body = input.body.trim().replace(/[·—–]/g, ",").slice(0, 2000);
  if (!body) throw new Error("Write a reply first.");

  const thread = await getThreadById(input.threadId);
  if (!thread) throw new Error("Thread not found.");

  const mentionIds = await resolveMentionIds(body, input.mentionIds);
  const id = randomUUID();
  const at = nowIso();
  const row: ReplyRow = {
    id,
    thread_id: input.threadId,
    person_id: input.personId,
    body,
    mention_ids: mentionIds,
    created_at: at,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const replies = ((s as StoreBag).discussion_replies ??= []);
      replies.push(row);
      const threads = ((s as StoreBag).discussion_threads ??= []);
      const t = threads.find((x) => x.id === input.threadId);
      if (t) t.updated_at = at;
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const { error } = await sb.from("discussion_replies").insert(row);
    if (error) throw new Error(error.message);
    await sb
      .from("discussion_threads")
      .update({ updated_at: at })
      .eq("id", input.threadId);
  }

  await maybeEnsureCaseChat(thread.team_id, thread.case_id);

  const href = discussionHref({
    caseId: thread.case_id,
    teamId: thread.team_id,
    kind: thread.kind,
    targetId: thread.target_id,
    threadId: thread.id,
  });

  await notifyMentions({
    mentionIds,
    fromPersonId: input.personId,
    body,
    href,
    threadId: thread.id,
  });

  await logActivity({
    person_id: input.personId,
    action: "discussion_reply",
    target: thread.id,
    meta: { kind: thread.kind, caseId: thread.case_id, teamId: thread.team_id },
  });

  const person = await getPersonById(input.personId);
  return {
    id,
    thread_id: input.threadId,
    person_id: input.personId,
    person_name: person?.name ?? null,
    body,
    mention_ids: mentionIds,
    created_at: at,
  };
}

/** Cruxy writes in a thread: pushback after an @Cruxy, or a note that it redrafted. */
export async function addCruxyReply(input: { threadId: string; body: string }): Promise<DiscussionReply> {
  const body = input.body.trim().replace(/[·—–]/g, ",").slice(0, 2000);
  if (!body) throw new Error("Empty reply.");
  const thread = await getThreadById(input.threadId);
  if (!thread) throw new Error("Thread not found.");
  const at = nowIso();
  const row: ReplyRow = {
    id: randomUUID(),
    thread_id: input.threadId,
    person_id: null,
    author: "cruxy",
    body,
    mention_ids: [],
    created_at: at,
  };
  if (isSampleDataMode()) {
    await updateStore((s) => {
      ((s as StoreBag).discussion_replies ??= []).push(row);
      const t = ((s as StoreBag).discussion_threads ??= []).find((x) => x.id === input.threadId);
      if (t) t.updated_at = at;
    });
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const { error } = await sb.from("discussion_replies").insert(row);
    if (error) throw new Error(error.message);
    await sb.from("discussion_threads").update({ updated_at: at }).eq("id", input.threadId);
  }
  await logActivity({
    person_id: null,
    action: "discussion_cruxy_reply",
    target: thread.id,
    meta: { kind: thread.kind, caseId: thread.case_id, teamId: thread.team_id },
  });
  return { ...row, person_name: "Cruxy" };
}

export async function getThreadCounts(input: {
  teamId: string;
  caseId: string;
}): Promise<Record<string, number>> {
  const threads = await listThreadsForCase(input);
  const out: Record<string, number> = {};
  for (const t of threads) {
    out[`${t.kind}:${t.target_id}`] = t.reply_count;
  }
  return out;
}

export async function markDiscussionVisit(input: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<string> {
  const at = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((s as StoreBag).discussion_visits ??= []);
      const i = bag.findIndex(
        (v) =>
          v.person_id === input.personId &&
          v.team_id === input.teamId &&
          v.case_id === input.caseId,
      );
      const row: VisitRow = {
        person_id: input.personId,
        team_id: input.teamId,
        case_id: input.caseId,
        last_seen_at: at,
      };
      if (i >= 0) bag[i] = row;
      else bag.push(row);
    });
    return at;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  await getServiceSupabase().from("discussion_visits").upsert(
    {
      person_id: input.personId,
      team_id: input.teamId,
      case_id: input.caseId,
      last_seen_at: at,
    },
    { onConflict: "person_id,team_id,case_id" },
  );
  return at;
}

export async function getDiscussionVisit(input: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (
      ((store as StoreBag).discussion_visits ?? []).find(
        (v) =>
          v.person_id === input.personId &&
          v.team_id === input.teamId &&
          v.case_id === input.caseId,
      )?.last_seen_at ?? null
    );
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const { data } = await getServiceSupabase()
    .from("discussion_visits")
    .select("last_seen_at")
    .eq("person_id", input.personId)
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId)
    .maybeSingle();
  return (data?.last_seen_at as string | undefined) ?? null;
}

export async function listRepliesSince(input: {
  teamId: string;
  caseId: string;
  since: string | null;
}): Promise<
  Array<{
    thread: DiscussionThread;
    replies: DiscussionReply[];
  }>
> {
  const threads = await listThreadsForCase({
    teamId: input.teamId,
    caseId: input.caseId,
  });
  const out: Array<{ thread: DiscussionThread; replies: DiscussionReply[] }> =
    [];
  for (const t of threads) {
    const replies = await listReplies(t.id);
    const fresh = input.since
      ? replies.filter((r) => r.created_at > input.since!)
      : replies;
    if (fresh.length) out.push({ thread: t, replies: fresh });
  }
  return out;
}
