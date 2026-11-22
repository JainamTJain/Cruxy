"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Chat = { id: string; channel: string; team_id: string | null };
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
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [cases, setCases] = useState<CaseOpt[]>([]);
  const [caseId, setCaseId] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [passage, setPassage] = useState("");
  const [timestamp, setTimestamp] = useState("");

  const load = useCallback(async (id?: string) => {
    const q = id ? `?chatId=${id}` : "";
    const res = await fetch(`/api/team/chat${q}`);
    const data = await res.json();
    setChats(data.chats ?? []);
    if (id) setMessages(data.messages ?? []);
    else if (data.chats?.[0]) {
      setChatId(data.chats[0].id);
    }
  }, []);

  useEffect(() => {
    void load();
    void fetch("/api/auth/people")
      .then((r) => r.json())
      .then((d: { people?: Person[] }) => {
        const map: Record<string, string> = {};
        for (const p of d.people ?? []) map[p.id] = p.name;
        setNames(map);
        setPeople(d.people ?? []);
      });
    void fetch("/api/team/board")
      .then((r) => r.json())
      .then(
        (d: {
          board?: { cases?: { case: CaseOpt }[] };
        }) => {
          setCases((d.board?.cases ?? []).map((row) => row.case));
        },
      );
  }, [load]);

  useEffect(() => {
    if (chatId) void load(chatId);
  }, [chatId, load]);

  async function send(asIdea = false) {
    if (!chatId || !text.trim()) return;
    await fetch("/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId,
        message: text,
        isIdea: asIdea,
        mentionIds: mentions,
        caseId: caseId || null,
        passageRef: passage.trim() || null,
        timestampRef: timestamp.trim() || null,
      }),
    });
    setText("");
    setMentions([]);
    setPassage("");
    setTimestamp("");
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

  function label(channel: string) {
    if (channel === "program:all") return "All program";
    if (channel.startsWith("team:")) return "Team channel";
    return channel;
  }

  return (
    <main className="animate-fade-up flex min-h-[70vh] w-full min-w-0 flex-col gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold">Team chat</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone can read every channel. Posting is for your team (admins
          anywhere). Chat does not create tasks. Mention people with @Name, and
          link a case, passage, or timestamp when it helps.
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap gap-2">
        {chats.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChatId(c.id)}
            className={
              c.id === chatId
                ? "rounded-xl bg-ink px-3 py-2 text-xs text-white"
                : "rounded-xl border border-ink/15 px-3 py-2 text-xs"
            }
          >
            {label(c.channel)}
          </button>
        ))}
        {!chats.length ? (
          <p className="text-sm text-muted">
            No channels yet. Team channels appear once teams are set up.
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white/60">
        <div className="min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-4">
          {messages.map((m) => {
            const refs = m.link_refs ?? {};
            const bits: string[] = [];
            if (m.case_id) bits.push("case linked");
            if (typeof refs.passage === "string" && refs.passage) {
              bits.push(`passage: ${refs.passage}`);
            }
            if (typeof refs.timestamp === "string" && refs.timestamp) {
              bits.push(`at ${refs.timestamp}`);
            }
            return (
              <div key={m.id} className="min-w-0 text-sm">
                <p className="break-words text-[11px] text-muted">
                  {m.from_cruxy
                    ? "Cruxy"
                    : names[m.person_id ?? ""] ?? "Member"}
                  <span className="mx-1">,</span>
                  {new Date(m.created_at).toLocaleString()}
                  {m.is_idea ? (
                    <>
                      <span className="mx-1">,</span>
                      idea
                    </>
                  ) : null}
                </p>
                <p className="mt-0.5 break-words whitespace-pre-wrap">
                  {m.body}
                </p>
                {m.mention_ids?.length ? (
                  <p className="text-[11px] text-muted">
                    Mentions:{" "}
                    {m.mention_ids
                      .map((id) => names[id] ?? "teammate")
                      .join(", ")}
                  </p>
                ) : null}
                {bits.length ? (
                  <p className="text-[11px] text-muted">{bits.join(", ")}</p>
                ) : null}
                {!m.is_idea && !m.from_cruxy ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-cardinal underline"
                    onClick={() => void markIdea(m.id)}
                  >
                    Mark as idea → Truth Sources queue
                  </button>
                ) : null}
              </div>
            );
          })}
          {!messages.length ? (
            <p className="text-sm text-muted">
              No messages yet. Write the first note, mention a teammate, or link
              a case so the thread has a place to start.
            </p>
          ) : null}
        </div>
        <div className="space-y-2 border-t border-ink/10 p-3">
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = mentions.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setMentions((prev) =>
                      on ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                    );
                    if (!on && !text.includes(`@${p.name}`)) {
                      setText((t) => `${t}${t ? " " : ""}@${p.name} `);
                    }
                  }}
                  className={
                    on
                      ? "rounded-lg bg-ink px-2 py-1 text-[11px] text-white"
                      : "rounded-lg border border-ink/15 px-2 py-1 text-[11px]"
                  }
                >
                  @{p.name}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[11px] font-semibold text-muted">
              Case
              <select
                className="mt-1 w-full rounded-xl border border-ink/15 px-2 py-2 text-sm"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              >
                <option value="">No case</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number}. {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted">
              Passage
              <input
                className="mt-1 w-full rounded-xl border border-ink/15 px-2 py-2 text-sm"
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                placeholder="optional"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted">
              Timestamp
              <input
                className="mt-1 w-full rounded-xl border border-ink/15 px-2 py-2 text-sm"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                placeholder="e.g. 12:40"
              />
            </label>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <input
              className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message the channel…"
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
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
      </div>
    </main>
  );
}
