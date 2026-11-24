"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discussionAnchorId,
  type DiscussionReply,
  type DiscussionThreadKind,
} from "@/lib/discussion/types";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string };

type Props = {
  caseId: string;
  teamId: string;
  kind: DiscussionThreadKind;
  targetId: string;
  title?: string;
  className?: string;
  /** When true, start expanded (e.g. deep link). */
  startOpen?: boolean;
  /** Suggestion threads: Redraft from what the thread has said so far. */
  onRedraft?: () => Promise<void> | void;
};

const CRUXY: Person = { id: "cruxy", name: "Cruxy" };

/**
 * Small reply count + inline thread under an annotation, suggestion or field.
 */
export function ThreadInline({
  caseId,
  teamId,
  kind,
  targetId,
  title,
  className,
  startOpen,
  onRedraft,
}: Props) {
  // In a suggestion's thread, @Cruxy pushes back on the reasoning.
  const cruxyHere = kind === "suggestion";
  const [thinking, setThinking] = useState<null | "reply" | "redraft">(null);
  const [open, setOpen] = useState(Boolean(startOpen));
  const [count, setCount] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Person[]>([]);

  const anchor = discussionAnchorId(kind, targetId);

  const refreshCount = useCallback(async () => {
    if (!caseId || !teamId) return;
    const res = await fetch(
      `/api/discussion/threads?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      threads?: Array<{
        id: string;
        kind: string;
        target_id: string;
        reply_count: number;
      }>;
    };
    const hit = (data.threads ?? []).find(
      (t) => t.kind === kind && t.target_id === targetId,
    );
    if (hit) {
      setThreadId(hit.id);
      setCount(hit.reply_count);
    }
  }, [caseId, teamId, kind, targetId]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setBusy(true);
      setStatus(null);
      try {
        let id = threadId;
        if (!id) {
          const created = await fetch("/api/discussion/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              caseId,
              teamId,
              kind,
              targetId,
              title: title ?? "",
            }),
          });
          if (!created.ok) {
            const err = (await created.json().catch(() => ({}))) as {
              error?: string;
            };
            setStatus(err.error ?? "Could not open thread.");
            return;
          }
          const json = (await created.json()) as { thread: { id: string } };
          id = json.thread.id;
          setThreadId(id);
        }
        const res = await fetch(`/api/discussion/threads/${id}`);
        if (!res.ok) {
          setStatus("Could not load replies.");
          return;
        }
        const data = (await res.json()) as {
          replies: DiscussionReply[];
          people: Person[];
        };
        setReplies(data.replies ?? []);
        setPeople(data.people ?? []);
        setCount((data.replies ?? []).length);
      } finally {
        setBusy(false);
      }
    })();
  }, [open, threadId, caseId, teamId, kind, targetId, title]);

  function onDraft(value: string) {
    setDraft(value);
    const at = value.lastIndexOf("@");
    if (at < 0) {
      setSuggest([]);
      return;
    }
    const partial = value.slice(at + 1);
    if (partial.includes(" ") || partial.length > 40) {
      setSuggest([]);
      return;
    }
    const q = partial.toLowerCase();
    const matches = [...(cruxyHere ? [CRUXY] : []), ...people]
      .filter((p) => p.name.toLowerCase().startsWith(q) || !q)
      .slice(0, 6);
    // Name already typed in full: nothing left to pick.
    setSuggest(matches.length === 1 && matches[0]!.name.toLowerCase() === q ? [] : matches);
  }

  function pickMention(p: Person) {
    const at = draft.lastIndexOf("@");
    setDraft(
      at >= 0
        ? `${draft.slice(0, at)}@${p.name} `
        : `${draft}${draft ? " " : ""}@${p.name} `,
    );
    setSuggest([]);
  }

  async function send() {
    if (!draft.trim() || !threadId) return;
    setBusy(true);
    setStatus(null);
    try {
      const mentionIds = people
        .filter((p) =>
          draft.toLowerCase().includes(`@${p.name.toLowerCase()}`),
        )
        .map((p) => p.id);
      const res = await fetch(`/api/discussion/threads/${threadId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft, mentionIds }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(err.error ?? "Could not send.");
        return;
      }
      const data = (await res.json()) as { reply: DiscussionReply };
      setReplies((prev) => [...prev, data.reply]);
      setCount((c) => c + 1);
      setDraft("");
      if (cruxyHere && /@cruxy\b/i.test(draft)) await askCruxy();
    } finally {
      setBusy(false);
    }
  }

  async function reloadReplies() {
    if (!threadId) return;
    const res = await fetch(`/api/discussion/threads/${threadId}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { replies?: DiscussionReply[] };
    if (data.replies) {
      setReplies(data.replies);
      setCount(data.replies.length);
    }
  }

  async function askCruxy() {
    setThinking("reply");
    try {
      const res = await fetch("/api/case/working-document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cruxy_reply", caseId, teamId, suggestionId: targetId }),
      }).catch(() => null);
      if (!res?.ok) setStatus("Cruxy could not reply just now. Try @Cruxy again.");
      await reloadReplies();
    } finally {
      setThinking(null);
    }
  }

  async function redraft() {
    if (!onRedraft) return;
    setThinking("redraft");
    try {
      await onRedraft();
      await reloadReplies();
    } finally {
      setThinking(null);
    }
  }

  return (
    <div
      id={anchor}
      className={cn("mt-2 scroll-mt-24", className)}
      data-discussion-kind={kind}
      data-discussion-target={targetId}
    >
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-[12px] font-semibold text-cardinal underline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {count > 0
          ? `${count} ${count === 1 ? "reply" : "replies"}`
          : "Reply"}
      </button>

      {open ? (
        <div className="mt-2 rounded-xl border border-mist bg-[#F7F8FA] px-3 py-2.5">
          {status ? (
            <p className="m-0 mb-2 text-xs text-cardinal">{status}</p>
          ) : null}
          <ul className="m-0 list-none space-y-2 p-0">
            {replies.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "text-sm",
                  r.author === "cruxy" && "rounded-lg border-l-[3px] border-[#6B4FD8] bg-[#F3F0FD] px-2.5 py-1.5",
                )}
              >
                <p className="m-0 text-[11px] text-muted">
                  <span className={r.author === "cruxy" ? "font-semibold text-[#4B2E9A]" : undefined}>
                    {r.author === "cruxy" ? "Cruxy" : r.person_name ?? "Someone"}
                  </span>
                  , {new Date(r.created_at).toLocaleString()}
                </p>
                <p className="m-0 mt-0.5 whitespace-pre-wrap">{r.body}</p>
              </li>
            ))}
            {thinking ? (
              <li className="flex items-center gap-1.5 text-xs text-[#4B2E9A]" aria-live="polite">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#6B4FD8]" />
                {thinking === "reply" ? "Cruxy is thinking about your reasoning..." : "Cruxy is redrafting from this thread..."}
              </li>
            ) : null}
            {!replies.length && !busy ? (
              <li className="text-xs text-muted">
                {cruxyHere
                  ? "No replies yet. Push back, add a half formed idea or ask for a different style. Type @Cruxy to have Cruxy question the reasoning, or Redraft at any point."
                  : "No replies yet. Write the first note or @mention a teammate."}
              </li>
            ) : null}
          </ul>

          <div className="relative mt-2">
            {suggest.length ? (
              <ul className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-32 list-none overflow-y-auto rounded-lg border border-mist bg-white p-1 shadow-sm">
                {suggest.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#F7F8FA]"
                      onClick={() => pickMention(p)}
                    >
                      @{p.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <input
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-mist bg-white px-2 text-sm"
                value={draft}
                disabled={busy}
                placeholder={cruxyHere ? "Reply, or type @Cruxy to have Cruxy push back" : "Reply… type @ to mention"}
                onChange={(e) => onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                className="rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
                onClick={() => void send()}
              >
                Send
              </button>
            </div>
            {cruxyHere ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || Boolean(thinking)}
                  className="rounded-lg border border-[#D9D1F7] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4B2E9A] disabled:opacity-60"
                  onClick={() => void askCruxy()}
                >
                  Ask Cruxy to push back
                </button>
                {onRedraft ? (
                  <button
                    type="button"
                    disabled={busy || Boolean(thinking)}
                    className="rounded-lg bg-[#4B2E9A] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={() => void redraft()}
                  >
                    Redraft from this thread
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
