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
};

export default function TeamChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});

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
      .then((d: { people?: { id: string; name: string }[] }) => {
        const map: Record<string, string> = {};
        for (const p of d.people ?? []) map[p.id] = p.name;
        setNames(map);
      });
  }, [load]);

  useEffect(() => {
    if (chatId) void load(chatId);
  }, [chatId, load]);

  async function send(asIdea = false) {
    if (!chatId || !text.trim()) return;
    await fetch("/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatId, message: text, isIdea: asIdea }),
    });
    setText("");
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
    <main className="animate-fade-up flex min-h-[70vh] flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">Team chat</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone can read every channel. Posting is for your team (admins
          anywhere). Chat does not create tasks.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
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
      </div>

      <div className="flex flex-1 flex-col rounded-2xl border border-ink/10 bg-white/60">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <p className="text-[11px] text-muted">
                {m.from_cruxy
                  ? "Cruxy"
                  : names[m.person_id ?? ""] ?? "Member"}{" "}
                · {new Date(m.created_at).toLocaleString()}
                {m.is_idea ? " · idea" : ""}
              </p>
              <p className="mt-0.5">{m.body}</p>
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
          ))}
          {!messages.length ? (
            <p className="text-sm text-muted">No messages yet.</p>
          ) : null}
        </div>
        <div className="flex gap-2 border-t border-ink/10 p-3">
          <input
            className="flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the channel…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <Button onClick={() => void send()}>Send</Button>
          <Button variant="outline" onClick={() => void send(true)}>
            Send as idea
          </Button>
        </div>
      </div>
    </main>
  );
}
