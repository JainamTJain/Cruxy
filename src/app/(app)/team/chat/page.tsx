"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Convo = {
  id: string;
  channel: string;
  title: string;
  purpose: string;
  audience: string;
  unread: number;
  kind: string;
  case_id: string | null;
};
type Msg = {
  id: string;
  body: string;
  person_id: string | null;
  from_cruxy: boolean;
  is_idea: boolean;
  created_at: string;
  mention_ids?: string[];
  case_id?: string | null;
  link_refs?: Record<string, unknown> | null;
};
type Person = { id: string; name: string };
type CaseOpt = { id: string; number: number; title: string };

export default function TeamChatPage() {
  const [conversations, setConversations] = useState<Convo[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [cases, setCases] = useState<CaseOpt[]>([]);
  const [caseId, setCaseId] = useState("");
  const [mentionSuggest, setMentionSuggest] = useState<Person[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [jumpId, setJumpId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of people) map[p.id] = p.name;
    return map;
  }, [people]);

  const active = conversations.find((c) => c.id === chatId) ?? null;

  const load = useCallback(async (id?: string | null) => {
    const q = id ? `?chatId=${encodeURIComponent(id)}` : "";
    const res = await fetch(`/api/team/chat${q}`);
    if (!res.ok) {
      setStatus("Could not load chat.");
      return;
    }
    const data = (await res.json()) as {
      conversations?: Convo[];
      chats?: Convo[];
      messages?: Msg[];
      people?: Person[];
      cases?: CaseOpt[];
    };
    const convos = data.conversations ?? data.chats ?? [];
    setConversations(convos);
    if (data.people) setPeople(data.people);
    if (data.cases) setCases(data.cases);
    if (id) {
      setMessages(data.messages ?? []);
      setChatId(id);
      setStatus(null);
      return;
    }
    const first = convos[0]?.id ?? null;
    if (first) {
      const res2 = await fetch(
        `/api/team/chat?chatId=${encodeURIComponent(first)}`,
      );
      if (res2.ok) {
        const data2 = (await res2.json()) as {
          conversations?: Convo[];
          messages?: Msg[];
        };
        setConversations(data2.conversations ?? convos);
        setMessages(data2.messages ?? []);
      }
      setChatId(first);
    }
    setStatus(null);
  }, []);

  useEffect(() => {
    let fromUrl: string | null = null;
    let jump: string | null = null;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      fromUrl = sp.get("chatId");
      jump = sp.get("jump");
    }
    if (jump) setJumpId(jump);
    void load(fromUrl);
  }, [load]);

  useEffect(() => {
    if (!jumpId || !messages.length) return;
    const el = document.getElementById(`msg-${jumpId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-cardinal");
      setJumpId(null);
    }
  }, [jumpId, messages]);

  useEffect(() => {
    // Newest at bottom: keep scrolled to end when messages change
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function onTextChange(value: string) {
    setText(value);
    const at = value.lastIndexOf("@");
    if (at < 0) {
      setShowSuggest(false);
      return;
    }
    const partial = value.slice(at + 1);
    if (partial.includes(" ") || partial.length > 40) {
      setShowSuggest(false);
      return;
    }
    const q = partial.toLowerCase();
    const hits = people
      .filter((p) => p.name.toLowerCase().startsWith(q) || !q)
      .slice(0, 6);
    setMentionSuggest(hits);
    setShowSuggest(hits.length > 0);
  }

  function pickMention(p: Person) {
    const at = text.lastIndexOf("@");
    const next =
      at >= 0
        ? `${text.slice(0, at)}@${p.name} `
        : `${text}${text ? " " : ""}@${p.name} `;
    setText(next);
    setShowSuggest(false);
  }

  async function send(asIdea = false) {
    if (!chatId || !text.trim()) return;
    const mentionIds = people
      .filter((p) => text.toLowerCase().includes(`@${p.name.toLowerCase()}`))
      .map((p) => p.id);
    const res = await fetch("/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId,
        message: text,
        isIdea: asIdea,
        mentionIds,
        caseId: caseId || active?.case_id || null,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(err.error ?? "Could not send.");
      return;
    }
    const data = (await res.json()) as { notifiedNames?: string[] };
    if (data.notifiedNames?.length) {
      setStatus(`Notified ${data.notifiedNames.join(", ")}.`);
    } else {
      setStatus(null);
    }
    setText("");
    setShowSuggest(false);
    await load(chatId);
  }

  async function markIdea(id: string) {
    await fetch("/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markIdeaId: id }),
    });
    if (chatId) await load(chatId);
  }

  function notifiedLine(m: Msg): string | null {
    const refs = m.link_refs ?? {};
    const notified = refs.notified;
    if (Array.isArray(notified) && notified.length) {
      return `Notified ${notified
        .map((id) => names[String(id)] ?? "teammate")
        .join(", ")}.`;
    }
    if (m.mention_ids?.length) {
      return `Mentioned ${m.mention_ids
        .map((id) => names[id] ?? "teammate")
        .join(", ")}.`;
    }
    return null;
  }

  return (
    <div className="animate-fade-up flex min-h-[70vh] w-full min-w-0 flex-col gap-4">
      <div className="min-w-0">
        <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
          Team chat
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Named conversations for the whole team, each case, and leads. Type @
          to mention someone. Mentions show in notifications and on Home.
        </p>
      </div>

      {status ? <p className="m-0 text-sm text-muted">{status}</p> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Conversation list */}
        <aside className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto rounded-[20px] bg-white p-3">
          <p className="m-0 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Conversations
          </p>
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChatId(c.id)}
              className={`rounded-xl px-3 py-2.5 text-left ${
                c.id === chatId
                  ? "bg-ink text-white"
                  : "bg-[#F7F8FA] text-ink hover:bg-[#ECEEF1]"
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-snug">
                  {c.title}
                </span>
                {c.unread > 0 ? (
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                      c.id === chatId
                        ? "bg-white/20 text-white"
                        : "bg-cardinal text-white"
                    }`}
                  >
                    {c.unread}
                  </span>
                ) : null}
              </span>
              <span
                className={`mt-1 block text-[11px] leading-snug ${
                  c.id === chatId ? "text-white/75" : "text-muted"
                }`}
              >
                {c.audience} {c.purpose}
              </span>
            </button>
          ))}
          {!conversations.length ? (
            <p className="px-1 text-sm text-muted">
              No conversations yet. They appear once your team is set up.
            </p>
          ) : null}
        </aside>

        {/* Thread */}
        <section className="flex min-h-[60vh] min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-white">
          {active ? (
            <header className="border-b border-[#ECEEF1] px-4 py-3">
              <h2 className="font-display m-0 text-lg font-extrabold">
                {active.title}
              </h2>
              <p className="m-0 mt-1 text-sm text-muted">
                {active.audience} {active.purpose}
              </p>
            </header>
          ) : null}

          <div
            ref={listRef}
            className="min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-4"
          >
            {messages.map((m) => {
              const note = notifiedLine(m);
              return (
                <div
                  key={m.id}
                  id={`msg-${m.id}`}
                  className="min-w-0 scroll-mt-4 rounded-xl px-1 py-1 text-sm"
                >
                  <p className="break-words text-[11px] text-muted">
                    {m.from_cruxy
                      ? "Cruxy"
                      : names[m.person_id ?? ""] ?? "Member"}
                    {", "}
                    {new Date(m.created_at).toLocaleString()}
                    {m.is_idea ? ", idea" : ""}
                  </p>
                  <p className="mt-0.5 break-words whitespace-pre-wrap">
                    {m.body}
                  </p>
                  {note ? (
                    <p className="mt-0.5 text-[11px] text-muted">{note}</p>
                  ) : null}
                  {!m.is_idea && !m.from_cruxy ? (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-cardinal underline"
                      onClick={() => void markIdea(m.id)}
                    >
                      Mark as idea for Evidence Library
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!messages.length ? (
              <p className="text-sm text-muted">
                No messages yet. Write the first note or @mention a teammate.
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="relative space-y-2 border-t border-[#ECEEF1] p-3">
            {showSuggest ? (
              <ul className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-40 list-none overflow-y-auto rounded-xl border border-mist bg-white p-1 shadow-sm">
                {mentionSuggest.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F7F8FA]"
                      onClick={() => pickMention(p)}
                    >
                      @{p.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!active?.case_id ? (
              <label className="text-[11px] font-semibold text-muted">
                Link a case (optional)
                <select
                  className="mt-1 w-full max-w-sm rounded-xl border border-mist px-2 py-2 text-sm"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                >
                  <option value="">No case</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      Case {c.number}: {c.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                className="min-w-0 flex-1 rounded-xl border border-mist bg-white px-3 py-2 text-sm"
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                placeholder="Message… type @ to mention"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="flex shrink-0 gap-2">
                <Button onClick={() => void send()}>Send</Button>
                <Button variant="outline" onClick={() => void send(true)}>
                  Send as idea
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
