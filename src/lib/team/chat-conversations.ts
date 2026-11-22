/**
 * Wave 8 E: named team conversations, unread, mention notify.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import {
  caseChatChannel,
  conversationMeta,
  isLeadsChannel,
  leadsChannel,
  parseCaseChatChannel,
  parseTeamChannel,
  programChannel,
  teamChannel,
  wholeTeamChannel,
} from "@/lib/team/channels";
import { listCaseRoles, listChats, listMessages } from "@/lib/team/repository";
import type { ChatChannel, ChatConversation, ChatMessage } from "@/lib/team/types";
import { nowIso } from "@/lib/utils";

/** Resolve team from chat.team_id or from the channel name when team_id was never set. */
function chatTeamId(c: ChatChannel): string | null {
  if (c.team_id) return c.team_id;
  const fromCase = parseCaseChatChannel(c.channel);
  if (fromCase) return fromCase.teamId;
  return parseTeamChannel(c.channel);
}

export type ChatListPayload = {
  conversations: ChatConversation[];
  people: { id: string; name: string }[];
  cases: { id: string; number: number; title: string }[];
  meId: string;
};

async function ensureSampleChat(
  channel: string,
  teamId: string | null,
  meta: {
    title: string;
    purpose: string;
    audience: string;
    kind: string;
    caseId: string | null;
  },
): Promise<ChatChannel> {
  let found: ChatChannel | undefined;
  await updateStore((s) => {
    found = s.chats.find((c) => c.channel === channel);
    if (found) {
      found.title = meta.title;
      found.purpose = meta.purpose;
      found.audience = meta.audience;
      found.kind = meta.kind;
      found.case_id = meta.caseId;
      return;
    }
    const row: ChatChannel = {
      id: randomUUID(),
      channel,
      team_id: teamId,
      created_at: nowIso(),
      title: meta.title,
      purpose: meta.purpose,
      audience: meta.audience,
      kind: meta.kind,
      case_id: meta.caseId,
    };
    s.chats.push(row);
    found = row;
  });
  return found!;
}

async function ensureSupabaseChat(
  channel: string,
  teamId: string | null,
  meta: {
    title: string;
    purpose: string;
    audience: string;
    kind: string;
    caseId: string | null;
  },
): Promise<ChatChannel> {
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("chats")
    .select("*")
    .eq("channel", channel)
    .maybeSingle();
  if (existing) {
    await sb
      .from("chats")
      .update({
        title: meta.title,
        purpose: meta.purpose,
        audience: meta.audience,
        kind: meta.kind,
        case_id: meta.caseId,
        // Legacy rows often had channel but null team_id; members then saw nothing.
        team_id: teamId ?? (existing.team_id as string | null) ?? null,
      })
      .eq("id", existing.id);
    return {
      id: existing.id as string,
      channel: existing.channel as string,
      team_id: teamId ?? (existing.team_id as string | null) ?? null,
      created_at: existing.created_at as string,
      title: meta.title,
      purpose: meta.purpose,
      audience: meta.audience,
      kind: meta.kind,
      case_id: meta.caseId,
    };
  }
  const { data, error } = await sb
    .from("chats")
    .upsert(
      {
        channel,
        team_id: teamId,
        title: meta.title,
        purpose: meta.purpose,
        audience: meta.audience,
        kind: meta.kind,
        case_id: meta.caseId,
      },
      { onConflict: "channel" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id as string,
    channel: data.channel as string,
    team_id: (data.team_id as string | null) ?? null,
    created_at: data.created_at as string,
    title: meta.title,
    purpose: meta.purpose,
    audience: meta.audience,
    kind: meta.kind,
    case_id: meta.caseId,
  };
}

async function ensureChat(
  channel: string,
  teamId: string | null,
  meta: {
    title: string;
    purpose: string;
    audience: string;
    kind: string;
    caseId: string | null;
  },
): Promise<ChatChannel> {
  if (isSampleDataMode()) {
    return ensureSampleChat(channel, teamId, meta);
  }
  return ensureSupabaseChat(channel, teamId, meta);
}

/**
 * Always ensure the general Whole team conversation (and Leads only).
 * Case conversations are created lazily via ensureCaseConversation when
 * someone starts a thread on that case — not all twelve up front.
 */
export async function ensureTeamConversations(input: {
  teamId: string;
  cases?: { id: string; number: number; title: string }[];
}): Promise<ChatChannel[]> {
  const out: ChatChannel[] = [];

  const wholeMeta = conversationMeta({ channel: wholeTeamChannel(input.teamId) });
  out.push(
    await ensureChat(wholeTeamChannel(input.teamId), input.teamId, {
      title: wholeMeta.title,
      purpose: wholeMeta.purpose,
      audience: wholeMeta.audience,
      kind: wholeMeta.kind,
      caseId: null,
    }),
  );

  const leadsMeta = conversationMeta({ channel: leadsChannel(input.teamId) });
  out.push(
    await ensureChat(leadsChannel(input.teamId), input.teamId, {
      title: leadsMeta.title,
      purpose: leadsMeta.purpose,
      audience: leadsMeta.audience,
      kind: leadsMeta.kind,
      caseId: null,
    }),
  );

  const prog = conversationMeta({ channel: programChannel() });
  out.push(
    await ensureChat(programChannel(), null, {
      title: prog.title,
      purpose: prog.purpose,
      audience: prog.audience,
      kind: prog.kind,
      caseId: null,
    }),
  );

  return out;
}

/** Create (or refresh) the team's case conversation the first time work starts there. */
export async function ensureCaseConversation(input: {
  teamId: string;
  caseId: string;
  caseNumber?: number | null;
  caseTitle?: string | null;
}): Promise<ChatChannel> {
  const channel = caseChatChannel(input.teamId, input.caseId);
  const meta = conversationMeta({
    channel,
    caseNumber: input.caseNumber,
    caseTitle: input.caseTitle,
  });
  return ensureChat(channel, input.teamId, {
    title: meta.title,
    purpose: meta.purpose,
    audience: meta.audience,
    kind: meta.kind,
    caseId: input.caseId,
  });
}

async function getLastRead(
  personId: string,
  chatId: string,
): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = (
      store as {
        chat_reads?: {
          person_id: string;
          chat_id: string;
          last_read_at: string;
        }[];
      }
    ).chat_reads;
    return (
      (bag ?? []).find(
        (r) => r.person_id === personId && r.chat_id === chatId,
      )?.last_read_at ?? null
    );
  }
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data } = await getServiceSupabase()
      .from("chat_reads")
      .select("last_read_at")
      .eq("person_id", personId)
      .eq("chat_id", chatId)
      .maybeSingle();
    return (data?.last_read_at as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function markChatRead(input: {
  personId: string;
  chatId: string;
}): Promise<void> {
  const stamp = nowIso();
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = ((
        s as {
          chat_reads?: {
            person_id: string;
            chat_id: string;
            last_read_at: string;
          }[];
        }
      ).chat_reads ??= []);
      const i = bag.findIndex(
        (r) =>
          r.person_id === input.personId && r.chat_id === input.chatId,
      );
      const row = {
        person_id: input.personId,
        chat_id: input.chatId,
        last_read_at: stamp,
      };
      if (i >= 0) bag[i] = row;
      else bag.push(row);
    });
    return;
  }
  const { getServiceSupabase } = await import("@/lib/db/supabase/client");
  await getServiceSupabase().from("chat_reads").upsert(
    {
      person_id: input.personId,
      chat_id: input.chatId,
      last_read_at: stamp,
    },
    { onConflict: "person_id,chat_id" },
  );
}

function personIsLead(
  roles: { team_id: string; person_id: string; role: string }[],
  teamId: string,
  personId: string,
): boolean {
  return roles.some(
    (r) =>
      r.team_id === teamId &&
      r.person_id === personId &&
      (r.role === "lead_1" || r.role === "lead_2"),
  );
}

export async function listConversationsForPerson(input: {
  personId: string;
  teamId: string | null;
  isAdmin: boolean;
}): Promise<ChatListPayload> {
  let cases: { id: string; number: number; title: string }[] = [];
  let people: { id: string; name: string }[] = [];

  if (isSampleDataMode()) {
    const store = await readStore();
    cases = store.cases
      .slice()
      .sort((a, b) => a.number - b.number)
      .filter((c) => c.number <= 12)
      .map((c) => ({ id: c.id, number: c.number, title: c.title }));
    people = store.people
      .filter((p) =>
        input.teamId ? p.team_id === input.teamId : true,
      )
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const sb = getServiceSupabase();
    const [{ data: caseRows }, { data: peeps }] = await Promise.all([
      sb.from("cases").select("id,number,title").order("number"),
      input.teamId
        ? sb
            .from("people")
            .select("id,name")
            .eq("team_id", input.teamId)
            .order("name")
        : sb.from("people").select("id,name").order("name"),
    ]);
    cases = (caseRows ?? [])
      .filter((c) => (c.number as number) <= 12)
      .map((c) => ({
        id: c.id as string,
        number: c.number as number,
        title: c.title as string,
      }));
    people = (peeps ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
    }));
  }

  let ensured: ChatChannel[] = [];
  if (input.teamId) {
    try {
      ensured = await ensureTeamConversations({ teamId: input.teamId, cases });
    } catch (err) {
      // Still try to list; UI should not go empty if create raced.
      console.error("ensureTeamConversations failed", err);
    }
  }

  let allChats: ChatChannel[] = [];
  try {
    allChats = await listChats();
  } catch (err) {
    console.error("listChats failed", err);
    allChats = [];
  }

  // Merge ensured rows so a fresh Whole team chat is never dropped if list lags.
  const byChannel = new Map<string, ChatChannel>();
  for (const c of allChats) byChannel.set(c.channel, c);
  for (const c of ensured) byChannel.set(c.channel, c);
  allChats = [...byChannel.values()];

  const roles = input.teamId ? await listCaseRoles(input.teamId) : [];
  const isLead = input.teamId
    ? personIsLead(roles, input.teamId, input.personId)
    : false;

  const caseById = new Map(cases.map((c) => [c.id, c]));

  const visible = allChats.filter((c) => {
    if (c.channel === programChannel()) return input.isAdmin;
    if (!input.teamId) return input.isAdmin;

    const ownerTeam = chatTeamId(c);
    if (ownerTeam && ownerTeam !== input.teamId && !input.isAdmin) {
      return false;
    }
    if (
      c.channel === leadsChannel(input.teamId) ||
      c.kind === "leads" ||
      isLeadsChannel(c.channel)
    ) {
      return input.isAdmin || isLead;
    }
    // Own team (by team_id or channel name), including case chats that already exist.
    if (ownerTeam === input.teamId) return true;
    if (c.channel === teamChannel(input.teamId)) return true;
    if (input.isAdmin) return true;
    return false;
  });

  const conversations: ChatConversation[] = [];
  const seenIds = new Set<string>();
  for (const c of visible) {
    if (seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    const parsed = parseCaseChatChannel(c.channel);
    const caseRow = parsed ? caseById.get(parsed.caseId) : null;
    const meta = conversationMeta({
      channel: c.channel,
      caseNumber: caseRow?.number ?? null,
      caseTitle: caseRow?.title ?? null,
    });
    // Skip bare team:{other} when we have richer list for own team
    if (
      meta.kind === "whole_team" &&
      input.teamId &&
      c.channel !== teamChannel(input.teamId) &&
      !input.isAdmin
    ) {
      continue;
    }

    const messages = await listMessages(c.id);
    const lastRead = await getLastRead(input.personId, c.id);
    const unread = messages.filter((m) => {
      if (m.person_id === input.personId) return false;
      if (!lastRead) return true;
      return m.created_at > lastRead;
    }).length;

    conversations.push({
      ...c,
      team_id: chatTeamId(c) ?? c.team_id,
      title: c.title || meta.title,
      purpose: c.purpose || meta.purpose,
      audience: c.audience || meta.audience,
      kind: c.kind || meta.kind,
      case_id: c.case_id ?? meta.caseId,
      unread,
    });
  }

  // Last resort: if Whole team is still missing after ensure, surface a clear gap.
  const ownTeamId = input.teamId;
  if (
    ownTeamId &&
    !conversations.some(
      (c) =>
        c.kind === "whole_team" || c.channel === teamChannel(ownTeamId),
    )
  ) {
    try {
      const whole = await ensureChat(
        wholeTeamChannel(ownTeamId),
        ownTeamId,
        {
          title: "Whole team",
          purpose: "Day to day notes for everyone on your team.",
          audience: "Your whole team can see this.",
          kind: "whole_team",
          caseId: null,
        },
      );
      conversations.unshift({
        ...whole,
        title: whole.title || "Whole team",
        purpose:
          whole.purpose || "Day to day notes for everyone on your team.",
        audience: whole.audience || "Your whole team can see this.",
        kind: "whole_team",
        case_id: null,
        unread: 0,
      });
    } catch {
      // leave empty; UI copy explains what to tap
    }
  }

  // Stable order: Whole team, cases by number, Leads, program
  const kindOrder = (k: string) => {
    if (k === "whole_team") return 0;
    if (k === "case") return 1;
    if (k === "leads") return 2;
    if (k === "program") return 3;
    return 4;
  };
  conversations.sort((a, b) => {
    const ko = kindOrder(a.kind) - kindOrder(b.kind);
    if (ko !== 0) return ko;
    if (a.kind === "case" && b.kind === "case") {
      const an = caseById.get(a.case_id ?? "")?.number ?? 0;
      const bn = caseById.get(b.case_id ?? "")?.number ?? 0;
      return an - bn;
    }
    return a.title.localeCompare(b.title);
  });

  return {
    conversations,
    people,
    cases,
    meId: input.personId,
  };
}

/** Resolve a message's chat id without mutating it (for access gates). */
export async function getMessageChatId(
  messageId: string,
): Promise<string | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return store.messages.find((m) => m.id === messageId)?.chat_id ?? null;
  }
  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data } = await getServiceSupabase()
      .from("messages")
      .select("chat_id")
      .eq("id", messageId)
      .maybeSingle();
    return (data?.chat_id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** True when chatId is in the person's visible conversation list. */
export async function personCanAccessChat(input: {
  personId: string;
  teamId: string | null;
  isAdmin: boolean;
  chatId: string;
}): Promise<boolean> {
  const payload = await listConversationsForPerson({
    personId: input.personId,
    teamId: input.teamId,
    isAdmin: input.isAdmin,
  });
  return payload.conversations.some((c) => c.id === input.chatId);
}

/**
 * People who may be @mentioned in this conversation.
 * Leads-only: current leads (+ admins already have access via isAdmin lists).
 * Other team chats: everyone on the team returned in the payload people list.
 */
export async function mentionablePersonIds(input: {
  chatId: string;
  teamId: string | null;
  isAdmin: boolean;
  actorId: string;
}): Promise<Set<string>> {
  // Use an admin-ish view only to discover the conversation kind; then
  // compute who belongs. Prefer leads when kind is leads.
  const viewer = await listConversationsForPerson({
    personId: input.actorId,
    teamId: input.teamId,
    isAdmin: input.isAdmin,
  });
  const convo = viewer.conversations.find((c) => c.id === input.chatId);
  if (!convo) return new Set();

  if (convo.kind === "leads" && input.teamId) {
    const roles = await listCaseRoles(input.teamId);
    const ids = new Set<string>();
    for (const r of roles) {
      if (
        r.team_id === input.teamId &&
        (r.role === "lead_1" || r.role === "lead_2")
      ) {
        ids.add(r.person_id);
      }
    }
    return ids;
  }

  return new Set(viewer.people.map((p) => p.id));
}

export async function notifyMentions(input: {
  message: ChatMessage;
  actorId: string;
  actorName: string;
  chatTitle: string;
  /** When set, only these person ids may be notified (visibility gate). */
  allowedPersonIds?: Set<string>;
}): Promise<string[]> {
  const notified: string[] = [];
  for (const pid of input.message.mention_ids) {
    if (pid === input.actorId) continue;
    if (input.allowedPersonIds && !input.allowedPersonIds.has(pid)) continue;
    try {
      await createNotification({
        personId: pid,
        kind: "chat_mention",
        title: `${input.actorName} mentioned you`,
        body: `In ${input.chatTitle}: ${input.message.body.slice(0, 120)}`,
        href: `/team/chat?chatId=${input.message.chat_id}&jump=${input.message.id}`,
        payload: {
          chat_id: input.message.chat_id,
          message_id: input.message.id,
        },
        createdBy: input.actorId,
      });
      notified.push(pid);
    } catch {
      // continue
    }
  }
  if (notified.length) {
    // Persist who was notified on the message for display
    const nextRefs = {
      ...(input.message.link_refs ?? {}),
      notified,
    };
    input.message.link_refs = nextRefs;
    if (isSampleDataMode()) {
      await updateStore((s) => {
        const msg = s.messages.find((m) => m.id === input.message.id);
        if (msg) msg.link_refs = nextRefs;
      });
    } else {
      try {
        const { getServiceSupabase } = await import("@/lib/db/supabase/client");
        await getServiceSupabase()
          .from("messages")
          .update({ link_refs: nextRefs })
          .eq("id", input.message.id);
      } catch {
        // ignore
      }
    }
    await logActivity({
      person_id: input.actorId,
      action: "chat_mention",
      target: input.message.chat_id,
      meta: { message_id: input.message.id, notified },
    });
  }
  return notified;
}
